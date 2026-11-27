import { describe, expect, it } from 'vitest';
import { MemoryCryptoHost } from '../lib/crypto-host';
import { errorReply, okReply } from '../lib/protocol';
import { MemoryStore } from '../lib/storage';
import { createRemoteStore, parseStoreRequest, type StoreRequest, type StoreTransport } from '../lib/store-bridge';
import { VaultService } from '../lib/vault-service';

const NOW = 1_700_000_000_000;
const SECRET = 'JBSWY3DPEHPK3PXP';

/** 按 service worker 侧的逻辑应答，测的正是线上那条通道 */
function bridge(local: MemoryStore, session: MemoryStore): StoreTransport {
  return async (request: StoreRequest) => {
    const area = request.kind === 'session' ? session : local;
    if (request.op === 'get') return okReply(await area.get(request.key));
    if (request.op === 'set') {
      await area.set(request.key, request.value);
      return okReply(true);
    }
    await area.remove(request.key);
    return okReply(true);
  };
}

function offscreenService(local: MemoryStore, session: MemoryStore) {
  return new VaultService(
    createRemoteStore('local', bridge(local, session)),
    createRemoteStore('session', bridge(local, session)),
    new MemoryCryptoHost(),
    () => NOW,
  );
}

describe('存储桥的消息校验', () => {
  it('只认 target=store 且字段齐全的请求', () => {
    expect(parseStoreRequest({ target: 'store', kind: 'local', op: 'get', key: 'vault.v2' })).toEqual({
      kind: 'local',
      op: 'get',
      key: 'vault.v2',
    });
    expect(parseStoreRequest({ target: 'store', kind: 'session', op: 'set', key: 'k', value: 1 })).toEqual({
      kind: 'session',
      op: 'set',
      key: 'k',
      value: 1,
    });
  });

  it('挡掉越权与残缺的请求', () => {
    expect(parseStoreRequest(null)).toBeNull();
    expect(parseStoreRequest({ target: 'vault', kind: 'local', op: 'get', key: 'k' })).toBeNull();
    expect(parseStoreRequest({ target: 'store', kind: 'sync', op: 'get', key: 'k' })).toBeNull();
    expect(parseStoreRequest({ target: 'store', kind: 'local', op: 'clear', key: 'k' })).toBeNull();
    expect(parseStoreRequest({ target: 'store', kind: 'local', op: 'get', key: '' })).toBeNull();
    expect(parseStoreRequest({ target: 'store', kind: 'local', op: 'get', key: 'k'.repeat(200) })).toBeNull();
    expect(parseStoreRequest({ target: 'store', kind: 'local', op: 'set', key: 'k' })).toBeNull();
  });

  it('多余字段不进下游', () => {
    const parsed = parseStoreRequest({
      target: 'store',
      kind: 'local',
      op: 'get',
      key: 'k',
      secret: 'SHOULD-NOT-PASS',
      extra: 1,
    });
    expect(parsed).toEqual({ kind: 'local', op: 'get', key: 'k' });
  });
});

describe('offscreen 用代理存储跑完整流程', () => {
  it('建库、加条目、读验证码都不依赖 chrome.storage', async () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    const service = offscreenService(local, session);

    await service.create('password-123', 'low');
    await service.add({ manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET } });

    const views = await service.listCodes();
    expect(views).toHaveLength(1);
    expect(views[0]!.issuer).toBe('GitHub');
    expect(views[0]!.code).toMatch(/^\d{6}$/);

    /** 密文确实落在被代理的那一侧 */
    expect(JSON.stringify(await local.get('vault.v2')).includes(SECRET)).toBe(false);
    expect(session.keys()).toContain('session.lastActivity');
  });

  it('offscreen 被销毁重建后仍能解锁同一份保险库', async () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    const first = offscreenService(local, session);
    await first.create('password-123', 'low');
    await first.add({ manual: { type: 'totp', issuer: 'GitHub', account: 'alice', secret: SECRET } });

    const rebuilt = offscreenService(local, session);
    expect(await rebuilt.status().then((s) => s.state)).toBe('locked');
    expect(await rebuilt.unlock('password-123')).toBe(1);
    expect(await rebuilt.listCodes()).toHaveLength(1);
  });

  it('后台回错误时把原始信息抛上来', async () => {
    const failing: StoreTransport = async () => errorReply(new Error('storage.session 不可用'));
    const store = createRemoteStore('session', failing);
    await expect(store.get('k')).rejects.toThrow('storage.session 不可用');
  });

  it('后台没应答时报 no-handler，不再静默当空值', async () => {
    const silent: StoreTransport = async () => undefined;
    const store = createRemoteStore('local', silent);
    await expect(store.get('k')).rejects.toThrow(/没有返回存储结果/);
  });
});
