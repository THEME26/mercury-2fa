/** 界面支持的语言。顺序即设置页下拉的顺序，英文固定排第一。 */
export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

/** 找不到匹配时一律回英文，主词典也是英文 */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some((locale) => locale.code === value);
}

/**
 * 浏览器的 `zh-HK`、`zh-Hant-TW`、`ja-JP` 这类标签折成受支持的码。
 * 繁体优先判断，`zh` 归到简体，其余语言取主标签。
 */
export function matchLocale(tag: string): Locale {
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) {
    return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  }
  const primary = lower.split('-')[0];
  if (primary === 'ja' || primary === 'ko' || primary === 'de' || primary === 'fr' || primary === 'es') {
    return primary;
  }
  return DEFAULT_LOCALE;
}

/** 按 `navigator.languages` 的顺序取第一个能匹配上的 */
export function detectLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    if (tag === '') continue;
    const matched = matchLocale(tag);
    if (matched !== DEFAULT_LOCALE) return matched;
    if (tag.toLowerCase().startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}
