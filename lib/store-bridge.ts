import { browser } from 'wxt/browser';
import { asVaultErrorCode, VaultError } from './errors';
import { isReply } from './protocol';
import type { KeyValueStore } from './storage';
import type { StorageKind } from './browser-store';

/**
 * offscreen 文档到 service worker 的存储桥。
 *
 * 背景：offscreen 文档不保证拿到 chrome.storage。实测 Edge 158 的 offscreen 里
 * `chrome` 只有 runtime 三个成员，`chrome.storage` 是 undefined。所以保险库的读写
 * 一律回到 service worker 执行，offscreen 只保留 DEK 与运算。
 *
 * 协议是单向的：只有 offscreen 能发，service worker 只认 sender 是 offscreen.html 的请求。
 */
export type StoreOp = 'get' | 'set' | 'remove';

export interface StoreRequest {
  kind: StorageKind;
  op: StoreOp;
  key: string;
  value?: unknown;
}

const KINDS: readonly StorageKind[] = ['local', 'session'];
const OPS: readonly StoreOp[] = ['get', 'set', 'remove'];
const MAX_KEY_CHARS = 128;
const TIMEOUT_MS = 5_000;

/** 字段逐个校验后重建，多余键不进下游 */
export function parseStoreRequest(raw: unknown): StoreRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const message = raw as Record<string, unknown>;
  if (message.target !== 'store') return null;

  const kind = message.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as StorageKind)) return null;

  const op = message.op;
  if (typeof op !== 'string' || !OPS.includes(op as StoreOp)) return null;

  const key = message.key;
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_CHARS) return null;

  if (op === 'set') {
    if (!('value' in message)) return null;
    return { kind: kind as StorageKind, op: 'set', key, value: message.value };
  }
  return { kind: kind as StorageKind, op: op as StoreOp, key };
}

export type StoreTransport = (request: StoreRequest) => Promise<unknown>;

const overMessage: StoreTransport = async (request) => {
  const message = { target: 'store' as const, ...request };
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = self.setTimeout(() => reject(new VaultError('timeout', '后台没有响应存储请求')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([browser.runtime.sendMessage(message), timeout]);
  } finally {
    self.clearTimeout(timer);
  }
};

/** service worker 刚被唤醒时偶发拿不到接收端，重试一次 */
async function transportWithRetry(request: StoreRequest): Promise<unknown> {
  try {
    return await overMessage(request);
  } catch (cause) {
    if (cause instanceof VaultError) throw cause;
    return overMessage(request);
  }
}

export function createRemoteStore(
  kind: StorageKind,
  transport: StoreTransport = transportWithRetry,
): KeyValueStore {
  async function call(request: StoreRequest): Promise<unknown> {
    const reply = await transport(request);
    if (!isReply(reply)) throw new VaultError('no-handler', '后台没有返回存储结果');
    if (!reply.ok) throw new VaultError(asVaultErrorCode(reply.error.code), reply.error.message);
    return reply.data;
  }

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return (await call({ kind, op: 'get', key })) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await call({ kind, op: 'set', key, value });
    },
    async remove(key: string): Promise<void> {
      await call({ kind, op: 'remove', key });
    },
  };
}
