import { browser } from 'wxt/browser';
import type { MessageKey } from '../i18n/keys';
import { autofillInPage, type FillOutcome } from './autofill';

export interface ActivePage {
  tabId: number;
  url: string;
  host: string;
}

export interface FillReport {
  ok: boolean;
  /** 界面按这个键取本地化文案，message 只留给日志与测试 */
  key: MessageKey;
  params?: Record<string, string | number>;
  message: string;
  outcome?: FillOutcome;
}

/** 当前活动标签页。没有 activeTab 授权时读不到 url，返回 null */
export async function getActivePage(): Promise<ActivePage | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number') return null;
    const url = tab.url ?? '';
    if (!/^https?:\/\//i.test(url)) return { tabId: tab.id, url, host: '' };
    return { tabId: tab.id, url, host: new URL(url).hostname };
  } catch {
    return null;
  }
}

function describe(outcome: FillOutcome | undefined): FillReport {
  if (!outcome) return { ok: false, key: 'fill.noResult', message: '页面没有返回结果' };
  if (outcome.ok) {
    if (outcome.mode === 'split') {
      const boxes = outcome.filled ?? 0;
      return {
        ok: true,
        key: 'fill.filledSplit',
        params: { n: boxes },
        message: `已填入${boxes} 格`,
        outcome,
      };
    }
    return { ok: true, key: 'fill.filled', message: '已填入验证码', outcome };
  }
  if (outcome.reason === 'low-score') return { ok: false, key: 'fill.lowScore', message: '这页不像在要验证码，未写入', outcome };
  if (outcome.reason === 'no-field') return { ok: false, key: 'fill.noField', message: '页面里没有可填入的输入框', outcome };
  if (outcome.reason === 'exception') return { ok: false, key: 'fill.exception', message: '填入出错，页面结构可能变化', outcome };
  return { ok: false, key: 'fill.rejected', message: '未填入', outcome };
}

/** 通过 activeTab 临时注入，不申请任何站点权限 */
export async function fillActivePage(code: string, digits: number, hint?: string): Promise<FillReport> {
  const page = await getActivePage();
  if (!page) return { ok: false, key: 'fill.noTab', message: '读不到当前标签页' };
  if (page.host === '') return { ok: false, key: 'fill.notWeb', message: '只能在普通网页上填入' };

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: page.tabId },
      func: autofillInPage,
      args: [{ code, digits, hint }],
    });
    const first = results?.[0];
    return describe(first?.result as FillOutcome | undefined);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/cannot be scripted|chrome:\/\//i.test(message)) {
      return { ok: false, key: 'fill.internal', message: '浏览器内部页面不允许注入' };
    }
    return { ok: false, key: 'fill.denied', message: '注入被拒绝，请刷新页面后重试' };
  }
}
