import { browser } from 'wxt/browser';

/** service worker 与 popup 共用一个闹钟名，改名只改这里 */
export const CLIPBOARD_ALARM = 'mc.clipboard';

/** alarms 的最小粒度是 30 秒，短于此值的设置按 30 秒执行 */
export const MIN_CLEAR_MS = 30_000;

/**
 * clipboardWrite 是可选权限：装好扩展不等于能写剪贴板。
 * 不带它时在 popup 点复制照样有效（那里有焦点与用户手势），
 * 只有 offscreen 里那次无人触发的覆写需要它。
 */
export async function hasClipboardAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ permissions: ['clipboardWrite'] });
  } catch {
    return false;
  }
}

/** 必须在用户手势里调用，授权气泡挂在扩展图标上 */
export async function requestClipboardAccess(): Promise<boolean> {
  try {
    return await browser.permissions.request({ permissions: ['clipboardWrite'] });
  } catch {
    return false;
  }
}

/**
 * 排清空前要同时满足：用户选了延时、权限在手。
 * 权限被收回后设置里的旧值仍在，这里再拦一道。
 */
export { shouldScheduleClear } from './clipboard-policy';

/**
 * 复制完成后排一次清空。清空本身由 offscreen 执行 —— service worker 没有 DOM，
 * popup 关掉之后也不存在了，只有 offscreen 文档在两者都不在时还活着。
 */
export async function scheduleClipboardClear(ms: number): Promise<void> {
  await browser.alarms.clear(CLIPBOARD_ALARM);
  if (!Number.isFinite(ms) || ms <= 0) return;
  await browser.alarms.create(CLIPBOARD_ALARM, { when: Date.now() + Math.max(MIN_CLEAR_MS, ms) });
}

export async function cancelClipboardClear(): Promise<void> {
  await browser.alarms.clear(CLIPBOARD_ALARM);
}
