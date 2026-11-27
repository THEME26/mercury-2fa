import { browser } from 'wxt/browser';

/** service worker 与 popup 共用一个闹钟名，改名只改这里 */
export const CLIPBOARD_ALARM = 'mc.clipboard';

/** alarms 的最小粒度是 30 秒，短于此值的设置按 30 秒执行 */
export const MIN_CLEAR_MS = 30_000;

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

export function describeClearDelay(ms: number): string {
  if (ms <= 0) return '不清空';
  if (ms % 60_000 === 0) return `${ms / 60_000} 分钟后清空`;
  return `${Math.round(ms / 1000)} 秒后清空`;
}
