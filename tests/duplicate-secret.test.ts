import { describe, expect, it } from 'vitest';
import { MemoryCryptoHost } from '../lib/crypto-host';
import { MemoryStore } from '../lib/storage';
import { VaultService } from '../lib/vault-service';

const NOW = 1_700_000_000_000;
const SECRET = 'JBSWY3DPEHPK3PXP';

async function setup() {
  const service = new VaultService(new MemoryStore(), new MemoryStore(), new MemoryCryptoHost(), () => NOW);
  await service.create('password-123', 'low');
  return service;
}

describe('重复种子检测', () => {
  it('同一个种子挂在两个账号上，两边都标出来', async () => {
    const service = await setup();
    await service.add({ manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET } });
    await service.add({ manual: { type: 'totp', issuer: 'GitLab', account: 'alice', secret: SECRET } });

    const views = await service.listCodes();
    expect(views).toHaveLength(2);
    expect(views.every((view) => view.sharedSecret)).toBe(true);
  });

  it('种子写法的差异不影响判定', async () => {
    const service = await setup();
    /** 小写、带空格、带补位，归一化后是同一个密钥 */
    await service.add({ manual: { type: 'totp', issuer: 'A', account: 'a', secret: SECRET } });
    await service.add({ manual: { type: 'totp', issuer: 'B', account: 'b', secret: 'jbsw y3dp ehpk 3pxp' } });

    const views = await service.listCodes();
    expect(views).toHaveLength(2);
    expect(views.every((view) => view.sharedSecret)).toBe(true);
  });

  it('不同种子不标记', async () => {
    const service = await setup();
    await service.add({ manual: { type: 'totp', issuer: 'A', account: 'a', secret: SECRET } });
    await service.add({ manual: { type: 'totp', issuer: 'B', account: 'b', secret: 'KRSXG5CTMVRXEZLU' } });

    const views = await service.listCodes();
    expect(views.map((view) => view.sharedSecret)).toEqual([false, false]);
  });

  it('标记不会把种子带进返回值', async () => {
    const service = await setup();
    await service.add({ manual: { type: 'totp', issuer: 'A', account: 'a', secret: SECRET } });
    await service.add({ manual: { type: 'totp', issuer: 'B', account: 'b', secret: SECRET } });

    expect(JSON.stringify(await service.listCodes())).not.toContain(SECRET);
  });
});
