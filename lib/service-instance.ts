import { SessionCryptoHost } from './crypto-host';
import { localStore, sessionStore } from './browser-store';
import { VaultService } from './vault-service';

/** popup 与 service worker 各自持有一份，共享同一套 storage */
export const vaultService = new VaultService(
  localStore,
  sessionStore,
  new SessionCryptoHost(sessionStore),
);
