import { MemoryCryptoHost } from './crypto-host';
import { localStore, sessionStore } from './browser-store';
import { VaultService } from './vault-service';

/** 只给 offscreen 文档用：DEK 落在 MemoryCryptoHost 的内存变量里 */
export function createVaultService(): VaultService {
  return new VaultService(localStore, sessionStore, new MemoryCryptoHost());
}
