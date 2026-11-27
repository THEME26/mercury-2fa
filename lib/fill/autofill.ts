/**
 * 注入到页面执行的填充逻辑。
 *
 * 这个函数必须完全自包含：`chrome.scripting.executeScript` 会把它序列化后送进
 * 页面的 isolated world，函数体内不能引用任何模块作用域变量，否则运行时报
 * ReferenceError。所有辅助函数都定义在内部。
 *
 * 同理，这里不 import 任何东西，也不读扩展存储——验证码由调用方通过 args 传入，
 * 页面侧拿不到种子、DEK 或保险库本身。
 */

export interface FillRequest {
  /** 已取好的验证码，页面侧只用一次 */
  code: string;
  /** 期望位数，用于和 maxlength 比对加分 */
  digits: number;
  /** 发行方名称，仅用于日志与命中说明，不参与写入 */
  hint?: string;
}

export interface FillOutcome {
  ok: boolean;
  /** 失败原因：no-field 表示页面上没有像验证码框的输入 */
  reason?: 'no-field' | 'low-score' | 'exception';
  score?: number;
  mode?: 'single' | 'split';
  filled?: number;
  /** 命中的字段标识，便于排查为什么填错了 */
  target?: string;
}

export function autofillInPage(request: FillRequest): FillOutcome {
  const MIN_SCORE = 60;
  const MAX_BOXES = 8;
  const BLOCKED = [
    'password',
    'hidden',
    'submit',
    'button',
    'reset',
    'image',
    'file',
    'checkbox',
    'radio',
    'color',
    'range',
    'date',
    'time',
    'month',
    'week',
    'datetime-local',
  ];

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  /** jsdom 里 clientWidth 恒为 0，真实浏览器里大于 0。用它决定要不要做布局可见性检查 */
  const rendered = document.documentElement.clientWidth > 0;

  /** 祖先链一路上有 display:none / visibility:hidden 就算不可见。只查自身会漏掉被父级隐藏的框 */
  const isChainVisible = (el: Element): boolean => {
    let node: Element | null = el;
    while (node && node !== document.documentElement) {
      if (node.hasAttribute('hidden')) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      node = node.parentElement;
    }
    return true;
  };

  const isRendered = (el: HTMLInputElement): boolean => {
    if (el.disabled || el.readOnly) return false;
    if (!isChainVisible(el)) return false;
    const style = window.getComputedStyle(el);
    if (style.opacity === '0') return false;
    if (rendered && el.getClientRects().length === 0) return false;
    return true;
  };

  const isCandidate = (el: HTMLInputElement): boolean => {
    const type = (el.type || 'text').toLowerCase();
    if (BLOCKED.indexOf(type) >= 0) return false;
    if (el.maxLength !== -1 && el.maxLength > MAX_BOXES) return false;
    return isRendered(el);
  };

  const scoreOf = (el: HTMLInputElement): number => {
    let score = 0;

    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (autocomplete === 'one-time-code') score = 100;
    else if (autocomplete.indexOf('one-time-code') >= 0) score = 90;
    else if (/(^|\s)(otp|code)(\s|$)/.test(autocomplete)) score = 60;

    const inputmode = (el.getAttribute('inputmode') || '').toLowerCase();
    const max = el.maxLength;
    if ((inputmode === 'numeric' || inputmode === 'tel' || inputmode === 'number') && max >= 4 && max <= MAX_BOXES) {
      score += 60;
    }

    const haystack = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label') || '',
      el.getAttribute('data-testid') || '',
      el.getAttribute('data-test') || '',
    ]
      .join(' ')
      .toLowerCase();
    if (/(otp|totp|one-?time|2fa|mfa|two-?factor|verif|auth|\bcode\b|\btoken\b|验证码|动态码|动态密码|口令)/.test(haystack)) {
      score += 50;
    }

    const form = el.form || el.closest('form');
    if (form && form.querySelector('input[type=password]')) score += 20;

    const pattern = el.getAttribute('pattern') || '';
    if (pattern && (/\[0-9\]/.test(pattern) || /\\d/.test(pattern) || /\[0-9\]\{/.test(pattern))) score += 20;

    if (max === request.digits) score += 20;

    return score;
  };

  const collect = (root: Document | ShadowRoot, out: HTMLInputElement[]): void => {
    const inputs = root.querySelectorAll('input');
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i] as HTMLInputElement;
      if (isCandidate(el)) out.push(el);
    }
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const shadow = (all[i] as Element).shadowRoot;
      if (shadow) collect(shadow, out);
    }
  };

  /** 六格拆分的验证码框：同一容器内全是 maxlength=1 的输入 */
  const splitBoxes = (el: HTMLInputElement): HTMLInputElement[] | null => {
    const scope: Element | null = el.closest('form') || el.parentElement;
    if (!scope) return null;
    const boxes: HTMLInputElement[] = [];
    const inputs = scope.querySelectorAll('input');
    for (let i = 0; i < inputs.length; i++) {
      const box = inputs[i] as HTMLInputElement;
      if (!isCandidate(box)) continue;
      boxes.push(box);
    }
    if (boxes.length < 4 || boxes.length > MAX_BOXES) return null;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i]!.maxLength !== 1) return null;
    }
    /** 容器里混进别的字段（密码框、搜索框）就不是纯验证码格子，宁可不动 */
    const others = Array.from(scope.querySelectorAll('input')).filter((node) => (node as HTMLInputElement).type !== 'hidden');
    if (others.length !== boxes.length) return null;
    return boxes;
  };

  /** 六个单字符框通常既没有 autocomplete 也没有 inputmode，只能靠分组识别 */
  const findGroups = (candidates: HTMLInputElement[]): HTMLInputElement[] | null => {
    const byParent = new Map<Element, HTMLInputElement[]>();
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i]!;
      if (el.maxLength !== 1) continue;
      const parent = el.parentElement;
      if (!parent) continue;
      const list = byParent.get(parent) ?? [];
      list.push(el);
      byParent.set(parent, list);
    }
    let found: HTMLInputElement[] | null = null;
    for (const group of byParent.values()) {
      if (found) break;
      if (group.length < 4 || group.length > MAX_BOXES) continue;
      const parent = group[0]!.parentElement;
      if (!parent) continue;
      const inScope = Array.from(parent.querySelectorAll('input')).filter(
        (node) => (node as HTMLInputElement).type !== 'hidden',
      ).length;
      if (inScope === group.length) found = group;
    }
    return found;
  };

  /** 绕过框架的 value 拦截：走原型链上的原生 setter，再补事件让框架感知 */
  const setNative = (el: HTMLInputElement, value: string): void => {
    if (nativeSetter) nativeSetter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const fillSplit = (boxes: HTMLInputElement[], score: number, target: string): FillOutcome => {
    let filled = 0;
    for (let i = 0; i < boxes.length && i < request.code.length; i++) {
      const box = boxes[i]!;
      const char = request.code.charAt(i);
      box.focus();
      setNative(box, char);
      box.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      box.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      filled += 1;
    }
    const last = boxes[Math.min(filled, boxes.length) - 1];
    if (last) last.focus();
    return { ok: filled > 0, mode: 'split', filled, score, target };
  };

  const fillSingle = (el: HTMLInputElement, score: number, target: string): FillOutcome => {
    el.focus();
    setNative(el, request.code);
    if (typeof el.select === 'function') el.select();
    return { ok: true, mode: 'single', filled: 1, score, target };
  };

  try {
    const candidates: HTMLInputElement[] = [];
    collect(document, candidates);

    if (candidates.length === 0) return { ok: false, reason: 'no-field' };

    let best: HTMLInputElement | null = null;
    let bestScore = 0;
    for (let i = 0; i < candidates.length; i++) {
      const score = scoreOf(candidates[i]!);
      if (score > bestScore) {
        bestScore = score;
        best = candidates[i]!;
      }
    }

    if (best && bestScore >= MIN_SCORE) {
      const target = `${best.name || best.id || best.tagName.toLowerCase()}`;
      const boxes = splitBoxes(best);
      return boxes ? fillSplit(boxes, bestScore, target) : fillSingle(best, bestScore, target);
    }

    /** 没有语义线索时才靠六格分组兜底，避免在有 autocomplete 的页面上误判 */
    const group = findGroups(candidates);
    if (group) return fillSplit(group, bestScore, 'split-group');

    return { ok: false, reason: 'low-score', score: bestScore };
  } catch (cause) {
    return { ok: false, reason: 'exception', target: cause instanceof Error ? cause.message : 'unknown' };
  }
}
