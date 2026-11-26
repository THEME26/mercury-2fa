import { beforeEach, describe, expect, it } from 'vitest';
import { SessionCryptoHost } from '../lib/crypto-host';
import { MemoryStore } from '../lib/storage';
import { VaultService } from '../lib/vault-service';

const PASSWORD = 'password-123';

function setup(startAt = 1_700_000_000_000) {
  const local = new MemoryStore();
  const session = new MemoryStore();
  const host = new SessionCryptoHost(session);
  let clock = startAt;
  const service = new VaultService(local, session, host, () => clock);
  return {
    local,
    session,
    service,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const GITHUB_URI = 'otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';

describe('创建与状态', () => {
  it('空库 → 创建 → 解锁态', async () => {
    const { service } = setup();
    expect((await service.status()).state).toBe('empty');

    const migrated = await service.create(PASSWORD, 'low');
    expect(migrated).toBe(0);

    const status = await service.status();
    expect(status.state).toBe('unlocked');
    expect(status.entryCount).toBe(0);
    expect(status.kdf?.m).toBe(19 * 1024);
  });

  it('主密码太短直接拒绝', async () => {
    const { service } = setup();
    await expect(service.create('short', 'low')).rejects.toThrow(/至少 8 位/);
  });

  it('v0.1 明文库在创建时被迁进来并删除原键', async () => {
    const { service, local } = setup();
    await local.set('vault.v1', {
      schemaVersion: 1,
      encrypted: false,
      entries: [
        {
          id: 'legacy-1',
          type: 'totp',
          issuer: 'Old',
          account: 'a@b.c',
          secret: 'JBSWY3DPEHPK3PXP',
          algorithm: 'SHA-1',
          digits: 6,
          period: 30,
          createdAt: 1,
        },
      ],
    });

    const migrated = await service.create(PASSWORD, 'low');
    expect(migrated).toBe(1);
    expect(await local.get('vault.v1')).toBeUndefined();

    const views = await service.listCodes();
    expect(views).toHaveLength(1);
    expect(views[0]!.issuer).toBe('Old');
  });
});

describe('条目与取码', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    await ctx.service.create(PASSWORD, 'low');
  });

  it('从 otpauth 链接添加后能取到 6 位码', async () => {
    await ctx.service.add({ uri: GITHUB_URI });
    const views = await ctx.service.listCodes();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ issuer: 'GitHub', account: 'alice@example.com', digits: 6 });
    expect(views[0]!.code).toMatch(/^\d{6}$/);
  });

  it('返回给界面的对象里没有种子字段', async () => {
    await ctx.service.add({ uri: GITHUB_URI });
    const [view] = await ctx.service.listCodes();
    expect(view).not.toHaveProperty('secret');
    expect(JSON.stringify(view).includes('JBSWY3DPEHPK3PXP')).toBe(false);
  });

  it('重复条目被拒绝', async () => {
    await ctx.service.add({ uri: GITHUB_URI });
    await expect(ctx.service.add({ uri: GITHUB_URI })).rejects.toThrow(/已经在库/);
  });

  it('脏种子会被拒绝', async () => {
    await expect(
      ctx.service.add({
        manual: { type: 'totp', issuer: 'Bad', account: 'x', secret: 'JBSWY3DP1' },
      }),
    ).rejects.toThrow(/非法字符/);
  });

  it('删除后列表变空', async () => {
    const entry = await ctx.service.add({ uri: GITHUB_URI });
    await ctx.service.remove(entry.id);
    expect(await ctx.service.listCodes()).toHaveLength(0);
  });

  it('置顶后排在最前', async () => {
    const first = await ctx.service.add({
      manual: { type: 'totp', issuer: 'Zebra', account: 'z', secret: 'JBSWY3DPEHPK3PXP' },
    });
    await ctx.service.add({
      manual: { type: 'totp', issuer: 'Alpha', account: 'a', secret: 'KRSXG5CTMVRXEZLU' },
    });
    expect((await ctx.service.listCodes())[0]!.issuer).toBe('Alpha');

    await ctx.service.togglePin(first.id);
    expect((await ctx.service.listCodes())[0]!.issuer).toBe('Zebra');
  });

  it('HOTP 计数器递增后取码变化', async () => {
    const entry = await ctx.service.add({
      manual: { type: 'hotp', issuer: 'Bank', account: 'u盾', secret: 'GEZDGNBVGY3TQOJQ', counter: 5 },
    });
    const before = (await ctx.service.listCodes())[0]!;
    expect(before.step).toBe(5);

    const next = await ctx.service.bumpCounter(entry.id);
    expect(next).toBe(6);
    const after = (await ctx.service.listCodes())[0]!;
    expect(after.step).toBe(6);
    expect(after.code).not.toBe(before.code);
  });
});

describe('锁定与解锁', () => {
  it('锁定后取码被拒，解锁后恢复', async () => {
    const ctx = setup();
    await ctx.service.create(PASSWORD, 'low');
    await ctx.service.add({ uri: GITHUB_URI });

    await ctx.service.lock();
    expect((await ctx.service.status()).state).toBe('locked');
    await expect(ctx.service.listCodes()).rejects.toThrow(/锁定/);

    await expect(ctx.service.unlock('wrong-password')).rejects.toThrow(/不正确/);
    const count = await ctx.service.unlock(PASSWORD);
    expect(count).toBe(1);
    expect(await ctx.service.listCodes()).toHaveLength(1);
  });

  it('空闲超时自动回到锁定态', async () => {
    const ctx = setup();
    await ctx.service.create(PASSWORD, 'low');
    ctx.advance(16 * 60 * 1000);

    await expect(ctx.service.listCodes()).rejects.toThrow(/锁定/);
    expect((await ctx.service.status()).state).toBe('locked');
  });

  it('解锁状态下有交互就会刷新活动时间', async () => {
    const ctx = setup();
    await ctx.service.create(PASSWORD, 'low');
    ctx.advance(10 * 60 * 1000);
    await ctx.service.listCodes();
    ctx.advance(10 * 60 * 1000);
    await expect(ctx.service.listCodes()).resolves.toBeDefined();
  });
});

describe('备份与改密码', () => {
  it('导出的备份能在新实例里导入', async () => {
    const a = setup();
    await a.service.create(PASSWORD, 'low');
    await a.service.add({ uri: GITHUB_URI });
    const backup = await a.service.exportBackup();

    expect(backup.includes('JBSWY3DPEHPK3PXP')).toBe(false);

    const b = setup();
    await b.service.create('other-password', 'low');
    const first = await b.service.importBackup(backup, PASSWORD);
    expect(first).toEqual({ imported: 1, skipped: 0 });

    const second = await b.service.importBackup(backup, PASSWORD);
    expect(second).toEqual({ imported: 0, skipped: 1 });
  });

  it('备份密码错误会报错', async () => {
    const a = setup();
    await a.service.create(PASSWORD, 'low');
    const backup = await a.service.exportBackup();

    const b = setup();
    await b.service.create('other-password', 'low');
    await expect(b.service.importBackup(backup, 'nope-nope')).rejects.toThrow(/备份密码不正确/);
  });

  it('改主密码后旧的失效、条目保留', async () => {
    const ctx = setup();
    await ctx.service.create(PASSWORD, 'low');
    await ctx.service.add({ uri: GITHUB_URI });

    await expect(ctx.service.changePassword('bad-password', 'new-password-1')).rejects.toThrow(/原主密码/);
    await ctx.service.changePassword(PASSWORD, 'new-password-1');

    await ctx.service.lock();
    await expect(ctx.service.unlock(PASSWORD)).rejects.toThrow(/不正确/);
    expect(await ctx.service.unlock('new-password-1')).toBe(1);
    expect(await ctx.service.listCodes()).toHaveLength(1);
  });
});

describe('自检', () => {
  it('四项检查全部为真', async () => {
    const { service } = setup();
    const report = await service.selfTest();
    expect(report.roundTripOk).toBe(true);
    expect(report.wrongPasswordRejected).toBe(true);
    expect(report.tamperRejected).toBe(true);
    expect(report.ciphertextBytes).toBeGreaterThan(0);
  });
});
