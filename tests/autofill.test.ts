// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { autofillInPage } from '../lib/fill/autofill';

const CODE = '482913';

function input(attrs: Record<string, string>): string {
  return `<input ${Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ')}>`;
}

function valueOf(el: Element): string {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  return descriptor?.get?.call(el) as string;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('单框识别', () => {
  it('autocomplete=one-time-code 直接命中', () => {
    document.body.innerHTML = input({ type: 'text', autocomplete: 'one-time-code', maxlength: '6' });
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe('single');
    expect(valueOf(document.querySelector('input')!)).toBe(CODE);
  });

  it('只有 inputmode 与 maxlength 也能命中', () => {
    document.body.innerHTML = input({ type: 'text', inputmode: 'numeric', maxlength: '6' });
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(outcome.score).toBeGreaterThanOrEqual(60);
  });

  it('name 含验证码语义且长度吻合', () => {
    document.body.innerHTML = input({ type: 'text', name: 'otp_code', maxlength: '6' });
    expect(autofillInPage({ code: CODE, digits: 6 }).ok).toBe(true);
  });

  it('中文 placeholder 也算线索', () => {
    document.body.innerHTML = `<form>${input({ type: 'text', placeholder: '请输入验证码', maxlength: '6' })}<input type="password"></form>`;
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(valueOf(document.querySelector('input[type=text]')!)).toBe(CODE);
  });
});

describe('拒绝填写', () => {
  it('只有密码框不动任何东西', () => {
    document.body.innerHTML = '<input type="password" name="password"><input type="password" name="confirm">';
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('no-field');
  });

  it('搜索框太长直接排除', () => {
    document.body.innerHTML = input({ type: 'search', maxlength: '120', name: 'q' });
    expect(autofillInPage({ code: CODE, digits: 6 }).reason).toBe('no-field');
  });

  it('普通邮箱框分数不够，不写入', () => {
    document.body.innerHTML = input({ type: 'email', name: 'email', maxlength: '60' });
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(false);
  });

  it('display:none 的框不填', () => {
    document.body.innerHTML = `<div style="display:none">${input({ type: 'text', autocomplete: 'one-time-code' })}</div>`;
    expect(autofillInPage({ code: CODE, digits: 6 }).ok).toBe(false);
  });
});

describe('六格拆分', () => {
  it('逐格填入，每格一位', () => {
    const box = '<input type="text" inputmode="numeric" maxlength="1">';
    document.body.innerHTML = `<form><div class="cells">${box.repeat(6)}</div></form>`;
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(outcome.mode).toBe('split');
    expect(outcome.filled).toBe(6);
    const values = Array.from(document.querySelectorAll('input')).map(valueOf).join('');
    expect(values).toBe(CODE);
  });

  it('没有语义线索时靠分组兜底', () => {
    const box = '<input maxlength="1">';
    document.body.innerHTML = `<div class="otp">${box.repeat(4)}</div>`;
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(outcome.filled).toBe(4);
  });

  it('密码框混在容器里时不认作拆分框', () => {
    document.body.innerHTML = `<form>${'<input maxlength="1">'.repeat(4)}<input type="password"></form>`;
    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.mode).not.toBe('split');
  });
});

describe('框架兼容', () => {
  it('绕过实例上的 value 拦截，并派发 input 事件', () => {
    document.body.innerHTML = input({ type: 'text', autocomplete: 'one-time-code', maxlength: '6' });
    const el = document.querySelector('input') as HTMLInputElement;

    let controlled = '';
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() {
        return controlled;
      },
      set(next: string) {
        controlled = next;
      },
    });

    let events = 0;
    el.addEventListener('input', () => {
      events += 1;
    });

    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(valueOf(el)).toBe(CODE);
    expect(events).toBe(1);
  });

  it('shadow DOM 里的框能找到', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = input({ type: 'text', autocomplete: 'one-time-code', maxlength: '6' });

    const outcome = autofillInPage({ code: CODE, digits: 6 });
    expect(outcome.ok).toBe(true);
    expect(valueOf(shadow.querySelector('input')!)).toBe(CODE);
  });
});
