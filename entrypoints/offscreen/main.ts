import { browser } from 'wxt/browser';
import { createOffscreenHandler } from '../../lib/offscreen-router';
import { normalizeCommand } from '../../lib/protocol';
import { createVaultService } from '../../lib/service-instance';

/**
 * offscreen 文档是整个扩展里唯一持有 DEK 的地方。
 * 它没有界面，只在 service worker 转发命令时执行一次运算。
 */
const service = createVaultService();

/** 剪贴板清空放这里：扩展页面有 clipboardWrite 权限，不需要焦点也能覆写 */
async function clearClipboard(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText('');
    return true;
  } catch {
    /** 旧路径兜底：个别版本上异步 API 会被拒，execCommand 仍可用 */
    try {
      const area = document.createElement('textarea');
      area.value = '';
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

const handle = createOffscreenHandler(service, clearClipboard);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id) return false;
  const command = normalizeCommand(message, 'offscreen');
  if (command === null) return false;

  void handle(command).then(sendResponse);
  return true;
});
