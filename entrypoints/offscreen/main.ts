import { browser } from 'wxt/browser';
import { createOffscreenHandler } from '../../lib/offscreen-router';
import { normalizeCommand, errorReply, type VaultCommand, type VaultReply } from '../../lib/protocol';
import { createVaultService } from '../../lib/service-instance';
import { createRemoteStore } from '../../lib/store-bridge';

/**
 * offscreen 文档是整个扩展里唯一持有 DEK 的地方。
 * 它没有界面，只在 service worker 转发命令时执行一次运算。
 *
 * 存储不在这里：offscreen 拿不到 chrome.storage（Edge 158 实测），
 * 读写一律经 store-bridge 回到 service worker。
 */
function buildHandler() {
  try {
    const service = createVaultService(createRemoteStore('local'), createRemoteStore('session'));
    return createOffscreenHandler(service, clearClipboard);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '加密进程初始化失败';
    console.error('[mercury-2fa] offscreen 初始化失败：', message);
    return async (_command: VaultCommand): Promise<VaultReply> => errorReply(new Error(message));
  }
}

/** 剪贴板清空放这里：扩展页面有 clipboardWrite 权限，不需要焦点也能覆写 */
async function clearClipboard(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText('');
    return true;
  } catch {
    /** offscreen 文档永远没有焦点，异步 API 必被拒；execCommand 仍可用 */
    try {
      const area = document.createElement('textarea');
      area.value = '';
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

const handle = buildHandler();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id) return false;
  const command = normalizeCommand(message, 'offscreen');
  if (command === null) return false;

  void handle(command).then(sendResponse);
  return true;
});
