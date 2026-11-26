import { browser } from 'wxt/browser';
import type { KeyValueStore } from './storage';

interface StorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

function makeStore(area: StorageArea): KeyValueStore {
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await area.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await area.remove(key);
    },
  };
}

/** 持久区：只放密文与非敏感设置 */
export const localStore = makeStore(browser.storage.local as unknown as StorageArea);

/** 内存区：DEK 与活动时间戳，浏览器退出即消失 */
export const sessionStore = makeStore(browser.storage.session as unknown as StorageArea);
