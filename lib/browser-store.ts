import { browser } from 'wxt/browser';
import type { KeyValueStore } from './storage';

interface StorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export type StorageKind = 'local' | 'session';

/**
 * 取存储区必须留到调用时。offscreen 文档在某些 Edge 版本上拿不到 chrome.storage，
 * 模块顶层直接取会让整个脚本抛异常，连 ping 都挂不上。
 */
export function storageArea(kind: StorageKind): StorageArea {
  const storage = (browser as unknown as { storage?: Record<string, StorageArea | undefined> }).storage;
  const area = storage?.[kind];
  if (!area) throw new Error(`浏览器没有提供 storage.${kind}，无法读写保险库`);
  return area;
}

function makeStore(pick: () => StorageArea): KeyValueStore {
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const result = await pick().get(key);
      return result[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await pick().set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await pick().remove(key);
    },
  };
}

/** 持久区：只放密文与非敏感设置 */
export const localStore = makeStore(() => storageArea('local'));

/** 内存区：DEK 与活动时间戳，浏览器退出即消失 */
export const sessionStore = makeStore(() => storageArea('session'));
