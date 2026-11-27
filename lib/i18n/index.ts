import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from './locales';
import type { MessageKey, MessageParams } from './keys';
import { en } from './messages/en';
import { zhCN } from './messages/zh-CN';
import { zhTW } from './messages/zh-TW';
import { ja } from './messages/ja';
import { ko } from './messages/ko';
import { de } from './messages/de';
import { fr } from './messages/fr';
import { es } from './messages/es';

const DICTS: Record<Locale, Record<MessageKey, string>> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  de,
  fr,
  es,
};

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 同步 `<html lang>`，顺便让浏览器的断行与字体回退跟着语言走 */
function syncDocumentLang(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function setLocale(locale: Locale): void {
  const changed = locale !== current;
  current = locale;
  // 首屏就是从模板的 lang 值过来的，此时 locale 没变也要把属性纠正过来
  syncDocumentLang(locale);
  if (!changed) return;
  for (const listener of listeners) listener();
}

/** 记住的偏好是 auto 时按浏览器语言判定 */
export function resolveLocale(preference: 'auto' | Locale): Locale {
  if (preference !== 'auto' && isLocale(preference)) return preference;
  const tags = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  return detectLocale(tags.filter((tag): tag is string => typeof tag === 'string'));
}

/**
 * 取词条并替换 `{name}` 占位符。当前语言缺键时回退英文，
 * 英文也缺时直接把键名抛到界面上 —— 宁可显示 `main.added` 也不要空白。
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = DICTS[current][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** 供设置页展示：每种语言的自称 */
export { LOCALES, DEFAULT_LOCALE } from './locales';
export type { Locale } from './locales';
export type { MessageKey, MessageParams } from './keys';
