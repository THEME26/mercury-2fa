import { browser } from 'wxt/browser';
import { autofillInPage, type FillOutcome } from './autofill';

export interface ActivePage {
  tabId: number;
  url: string;
  host: string;
}

export interface FillReport {
  ok: boolean;
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
  if (!outcome) return { ok: false, message: '页面没有返回结果' };
  if (outcome.ok) {
    const filled = outcome.mode === 'split' ? `${outcome.filled} 格` : '验证码';
    return { ok: true, message: `已填入${filled}`, outcome };
  }
  if (outcome.reason === 'low-score') return { ok: false, message: '这页不像在要验证码，未写入', outcome };
  if (outcome.reason === 'no-field') return { ok: false, message: '页面里没有可填入的输入框', outcome };
  if (outcome.reason === 'exception') return { ok: false, message: '填入出错，页面结构可能变化', outcome };
  return { ok: false, message: '未填入', outcome };
}

/** 通过 activeTab 临时注入，不申请任何站点权限 */
export async function fillActivePage(code: string, digits: number, hint?: string): Promise<FillReport> {
  const page = await getActivePage();
  if (!page) return { ok: false, message: '读不到当前标签页' };
  if (page.host === '') return { ok: false, message: '只能在普通网页上填入' };

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
      return { ok: false, message: '浏览器内部页面不允许注入' };
    }
    return { ok: false, message: '注入被拒绝，请刷新页面后重试' };
  }
}
