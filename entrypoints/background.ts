import { browser } from 'wxt/browser';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    const version = browser.runtime.getManifest().version;
    console.info(`[mercury-2fa] ${details.reason} v${version}`);
  });
});
