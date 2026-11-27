import { browser } from 'wxt/browser';
import { isLocale, type Locale } from './locales';
import { resolveLocale, setLocale } from './index';

export type LanguagePreference = 'auto' | Locale;

/**
 * 语言偏好放在保险库之外的 `storage.local` 里：
 * 锁定界面也要按用户选的语言显示，而保险库设置本身是加密的，锁着时读不到。
 */
const STORAGE_KEY = 'ui.language';

/** 默认英文，与文档、商店文案的主语言保持一致 */
export const DEFAULT_PREFERENCE: LanguagePreference = 'en';

let currentPreference: LanguagePreference = DEFAULT_PREFERENCE;

/** 设置页要回显当前选择，读这个同步值，避免再走一次存储 */
export function getLanguagePreference(): LanguagePreference {
  return currentPreference;
}

export async function loadLanguagePreference(): Promise<LanguagePreference> {
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY)) as Record<string, unknown>;
    const value = stored?.[STORAGE_KEY];
    if (value === 'auto' || isLocale(value)) return value;
  } catch {
    // 读不到就按默认语言走，不影响解锁
  }
  return DEFAULT_PREFERENCE;
}

/** 立即生效并落盘，失败时界面已经切过去，不阻塞使用 */
export async function applyLanguagePreference(preference: LanguagePreference): Promise<void> {
  currentPreference = preference;
  setLocale(resolveLocale(preference));
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: preference });
  } catch {
    // 存不下只在下次启动时退回默认语言
  }
}

/** 启动时调用：先读偏好，再决定这一屏用哪种语言 */
export async function initLanguage(): Promise<LanguagePreference> {
  const preference = await loadLanguagePreference();
  currentPreference = preference;
  setLocale(resolveLocale(preference));
  return preference;
}
