import { MemoryCryptoHost } from './crypto-host';
import { localStore, sessionStore } from './browser-store';
import type { KeyValueStore } from './storage';
import { VaultService } from './vault-service';

/**
 * 默认给 service worker 用：存储区就是自己的 chrome.storage。
 * offscreen 文档传自己的代理存储，见 lib/store-bridge.ts。
 */
export function createVaultService(
  local: KeyValueStore = localStore,
  session: KeyValueStore = sessionStore,
): VaultService {
  return new VaultService(local, session, new MemoryCryptoHost());
}
