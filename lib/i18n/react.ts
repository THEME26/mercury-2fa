import { useCallback, useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale, t } from './index';
import type { MessageKey, MessageParams } from './keys';
import type { Locale } from './locales';

/**
 * 语言变化时整棵界面重渲染，不需要在每个组件里传 locale。
 * `t` 每次读模块里的当前语言，所以文案永远和 `locale` 一致。
 */
export function useI18n(): { locale: Locale; t: (key: MessageKey, params?: MessageParams) => string } {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  const translate = useCallback((key: MessageKey, params?: MessageParams) => t(key, params), [locale]);
  return { locale, t: translate };
}
