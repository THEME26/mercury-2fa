import { describe, expect, it } from 'vitest';
import { MemoryCryptoHost } from '../lib/crypto-host';
import { MemoryStore } from '../lib/storage';
import { createOffscreenHandler } from '../lib/offscreen-router';
import { findSecretKey, type VaultReply } from '../lib/protocol';
import { VaultService } from '../lib/vault-service';

const NOW = 1_700_000_000_000;
const SECRET = 'JBSWY3DPEHPK3PXP';

function setup() {
  const local = new MemoryStore();
  const session = new MemoryStore();
  const service = new VaultService(local, session, new MemoryCryptoHost(), () => NOW);
  const handler = createOffscreenHandler(service, async () => true);
  return { local, session, service, handler };
}

function data<T>(reply: VaultReply): T {
  if (!reply.ok) throw new Error(`预期成功，实际 ${reply.error.message}`);
  return reply.data as T;
}

describe('offscreen 命令分发', () => {
  it('建库到取码的完整链路', async () => {
    const { handler } = setup();

    expect(data(await handler({ op: 'create', password: 'password-123', tier: 'low' }))).toBe(0);
    expect(data<{ state: string }>(await handler({ op: 'status' })).state).toBe('unlocked');

    const added = data<{ id: string }>(
      await handler({
        op: 'add',
        input: { manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET } },
      }),
    );
    expect(added.id).toMatch(/\w/);
    expect(Object.keys(added)).toEqual(['id']);

    const codes = data<Array<Record<string, unknown>>>(await handler({ op: 'codes' }));
    expect(codes).toHaveLength(1);
    expect(codes[0]!.issuer).toBe('GitHub');
    expect(String(codes[0]!.code)).toMatch(/^\d{6}$/);
  });

  it('取码的返回里没有种子字段', async () => {
    const { handler } = setup();
    await handler({ op: 'create', password: 'password-123', tier: 'low' });
    await handler({
      op: 'add',
      input: { manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET } },
    });

    const reply = await handler({ op: 'codes' });
    expect(findSecretKey(data<unknown>(reply))).toBeNull();
    expect(JSON.stringify(reply)).not.toContain(SECRET);
  });

  it('锁定后取码返回 locked 错误而不是抛异常', async () => {
    const { handler } = setup();
    await handler({ op: 'create', password: 'password-123', tier: 'low' });
    await handler({ op: 'lock' });

    const reply = await handler({ op: 'codes' });
    expect(reply.ok).toBe(false);
    if (!reply.ok) {
      expect(reply.error.code).toBe('locked');
      expect(reply.error.message).toMatch(/已锁定/);
    }
  });

  it('错密码回 wrong-password', async () => {
    const { handler, service } = setup();
    await handler({ op: 'create', password: 'password-123', tier: 'low' });
    await service.lock();

    const reply = await handler({ op: 'unlock', password: 'password-124' });
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error.code).toBe('wrong-password');
  });

  it('导出的密文能经命令层在另一台实例恢复', async () => {
    const first = setup();
    await first.handler({ op: 'create', password: 'password-123', tier: 'low' });
    await first.handler({
      op: 'add',
      input: { manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET } },
    });
    const backup = data<string>(await first.handler({ op: 'export' }));
    expect(backup).not.toContain(SECRET);

    const second = setup();
    await second.handler({ op: 'create', password: 'other-password', tier: 'low' });
    const result = data<{ imported: number; skipped: number }>(
      await second.handler({ op: 'import', text: backup, password: 'password-123' }),
    );
    expect(result.imported).toBe(1);

    const codes = data<Array<Record<string, unknown>>>(await second.handler({ op: 'codes' }));
    expect(codes).toHaveLength(1);
  });

  it('改主密码后旧密码失效', async () => {
    const { handler, service } = setup();
    await handler({ op: 'create', password: 'password-123', tier: 'low' });

    data(await handler({ op: 'rewrap', oldPassword: 'password-123', newPassword: 'password-456' }));
    await service.lock();

    expect((await handler({ op: 'unlock', password: 'password-123' })).ok).toBe(false);
    expect((await handler({ op: 'unlock', password: 'password-456' })).ok).toBe(true);
  });

  it('设置补丁落到存储，剪贴板清空走注入的回调', async () => {
    const { handler } = setup();
    await handler({ op: 'create', password: 'password-123', tier: 'low' });

    const settings = data<{ clipboardClearMs: number; lockAfterMs: number }>(
      await handler({ op: 'setSettings', patch: { clipboardClearMs: 60_000 } }),
    );
    expect(settings.clipboardClearMs).toBe(60_000);
    expect(settings.lockAfterMs).toBe(15 * 60 * 1000);

    expect(data<{ cleared: boolean }>(await handler({ op: 'clipboardClear' }))).toEqual({ cleared: true });
  });

  it('导出会记下备份时间', async () => {
    const { handler } = setup();
    await handler({ op: 'create', password: 'password-123', tier: 'low' });
    await handler({ op: 'add', input: { manual: { type: 'totp', issuer: 'A', account: 'a', secret: SECRET } } });
    await handler({ op: 'export' });

    const status = data<{ settings: { lastBackupAt?: number } }>(await handler({ op: 'status' }));
    expect(status.settings.lastBackupAt).toBe(NOW);
  });
});
