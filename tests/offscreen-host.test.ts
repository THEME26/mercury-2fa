import { describe, expect, it } from 'vitest';
import { MemoryCryptoHost } from '../lib/crypto-host';
import { MemoryStore } from '../lib/storage';
import { VaultService } from '../lib/vault-service';

const NOW = 1_700_000_000_000;
const SECRET = 'JBSWY3DPEHPK3PXP';

function setup() {
  const local = new MemoryStore();
  const session = new MemoryStore();
  const host = new MemoryCryptoHost();
  const service = new VaultService(local, session, host, () => NOW);
  return { local, session, host, service };
}

describe('DEK 只活在内存里', () => {
  it('建库后不往任何存储区写密钥', async () => {
    const { local, session, service } = setup();
    await service.create('password-123', 'low');

    expect(session.keys().some((key) => key.toLowerCase().includes('dek'))).toBe(false);
    expect(local.keys().some((key) => key.toLowerCase().includes('dek') && key !== 'vault.v2')).toBe(false);
    /** vault.v2 里的 wrappedDek 是密文，长度固定且不含种子 */
    expect(JSON.stringify(await local.get('vault.v2')).includes(SECRET)).toBe(false);
  });

  it('锁定后立刻无法解密', async () => {
    const { host, service } = setup();
    await service.create('password-123', 'low');
    expect(await host.isUnlocked()).toBe(true);

    await service.lock();
    expect(await host.isUnlocked()).toBe(false);
    await expect(service.listCodes()).rejects.toThrow(/已锁定/);
  });

  it('新的内存宿主等同于重启浏览器：状态归零', async () => {
    const { local, session, host, service } = setup();
    await service.create('password-123', 'low');
    expect(await host.isUnlocked()).toBe(true);

    /** 同一份存储，换一个宿主，正是 offscreen 被销毁后重建的情形 */
    const restarted = new VaultService(local, session, new MemoryCryptoHost(), () => NOW);
    const status = await restarted.status();
    expect(status.state).toBe('locked');
    await expect(restarted.listCodes()).rejects.toThrow(/已锁定/);
  });

  it('解锁后能用同一条主密码读回条目', async () => {
    const { local, session, service } = setup();
    await service.create('password-123', 'low');
    await service.add({
      manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET },
    });
    await service.lock();

    const second = new VaultService(local, session, new MemoryCryptoHost(), () => NOW);
    expect(await second.unlock('password-123')).toBe(1);
    const views = await second.listCodes();
    expect(views).toHaveLength(1);
    expect(views[0]!.issuer).toBe('GitHub');
  });

  it('错密码不会留下半开状态', async () => {
    const { local, session, service } = setup();
    await service.create('password-123', 'low');
    await service.lock();

    const second = new VaultService(local, session, new MemoryCryptoHost(), () => NOW);
    await expect(second.unlock('password-124')).rejects.toThrow(/主密码不正确/);
    expect(await second.status().then((status) => status.state)).toBe('locked');
  });
});
