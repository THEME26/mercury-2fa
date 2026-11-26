import { browser } from 'wxt/browser';
import { sessionStore } from '../lib/browser-store';
import { SessionCryptoHost } from '../lib/crypto-host';

export default defineBackground(() => {
  const host = new SessionCryptoHost(sessionStore);

  /** 系统进入空闲或锁屏时立刻丢弃 DEK，不等超时 */
  browser.idle.onStateChanged.addListener((state) => {
    if (state === 'idle' || state === 'locked') void host.lock();
  });

  browser.runtime.onInstalled.addListener((details) => {
    console.info(`[mercury-2fa] ${details.reason} v${browser.runtime.getManifest().version}`);
  });
});
