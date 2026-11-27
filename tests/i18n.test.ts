import { describe, expect, it } from 'vitest';
import { BackupError, UserError, VaultError } from '../lib/errors';
import { describeError } from '../lib/i18n/describe-error';
import { LOCALES, detectLocale, matchLocale, type Locale } from '../lib/i18n/locales';
import { getLocale, setLocale, subscribeLocale, t } from '../lib/i18n';
import { en } from '../lib/i18n/messages/en';
import { zhCN } from '../lib/i18n/messages/zh-CN';
import { zhTW } from '../lib/i18n/messages/zh-TW';
import { ja } from '../lib/i18n/messages/ja';
import { ko } from '../lib/i18n/messages/ko';
import { de } from '../lib/i18n/messages/de';
import { fr } from '../lib/i18n/messages/fr';
import { es } from '../lib/i18n/messages/es';

const DICTS: Record<Locale, Record<string, string>> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  de,
  fr,
  es,
};

const EN_KEYS = Object.keys(en).sort();

/** 从 `{n} 位` 这类模板里抽出占位符名字 */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('词条完整性', () => {
  it('八种语言的键集合与英文完全一致', () => {
    for (const [locale, dict] of Object.entries(DICTS)) {
      expect(Object.keys(dict).sort(), `${locale} 键不一致`).toEqual(EN_KEYS);
    }
  });

  it('没有空词条', () => {
    for (const [locale, dict] of Object.entries(DICTS)) {
      const empty = Object.entries(dict).filter(([, value]) => value.trim() === '');
      expect(empty.map(([key]) => key), `${locale} 有空词条`).toEqual([]);
    }
  });

  it('每条词条的占位符与英文一致', () => {
    for (const [locale, dict] of Object.entries(DICTS)) {
      const mismatch = EN_KEYS.filter((key) => {
        const expected = placeholders(en[key as keyof typeof en] ?? '').join(',');
        const actual = placeholders(dict[key] ?? '').join(',');
        return expected !== actual;
      });
      expect(mismatch, `${locale} 占位符不一致`).toEqual([]);
    }
  });

  it('八种语言都有自称，且英文排第一', () => {
    expect(LOCALES[0].code).toBe('en');
    for (const locale of LOCALES) expect(locale.label.length).toBeGreaterThan(0);
  });
});

describe('语言检测', () => {
  it('按浏览器标签折成受支持的码', () => {
    expect(matchLocale('ja-JP')).toBe('ja');
    expect(matchLocale('ko-KR')).toBe('ko');
    expect(matchLocale('de-AT')).toBe('de');
    expect(matchLocale('fr-CA')).toBe('fr');
    expect(matchLocale('es-419')).toBe('es');
    expect(matchLocale('zh-CN')).toBe('zh-CN');
    expect(matchLocale('zh-Hans')).toBe('zh-CN');
    expect(matchLocale('zh-TW')).toBe('zh-TW');
    expect(matchLocale('zh-HK')).toBe('zh-TW');
    expect(matchLocale('zh-Hant')).toBe('zh-TW');
    expect(matchLocale('ru-RU')).toBe('en');
  });

  it('按顺序取第一个能匹配上的语言', () => {
    expect(detectLocale(['fr-FR', 'en-US'])).toBe('fr');
    expect(detectLocale(['ru-RU', 'ja-JP'])).toBe('ja');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});

describe('取词与替换', () => {
  it('英文是默认语言', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('main.added')).toBe('Entry added');
  });

  it('切换语言后取到对应词条', () => {
    setLocale('ja');
    expect(t('main.added')).toBe('項目を追加しました');
    setLocale('ko');
    expect(t('main.added')).toBe('항목을 추가했습니다');
    setLocale('en');
  });

  it('占位符按参数替换，缺参数时原样保留', () => {
    setLocale('en');
    expect(t('main.digits', { n: 8 })).toBe('8 digits');
    expect(t('main.digits', { x: 1 })).toBe('{n} digits');
    setLocale('zh-CN');
    expect(t('main.digits', { n: 8 })).toBe('8 位');
    setLocale('en');
  });
});

describe('语言与 <html lang>', () => {
  /** node 环境没有 document，这里塞一个最小替身 */
  function withDocument(run: (html: { lang: string }) => void): void {
    const html = { lang: '' };
    const scope = globalThis as { document?: unknown };
    const original = scope.document;
    scope.document = { documentElement: html };
    try {
      run(html);
    } finally {
      if (original === undefined) delete scope.document;
      else scope.document = original;
      setLocale('en');
    }
  }

  it('设置为当前语言时也会纠正模板里残留的 lang', () => {
    withDocument((html) => {
      html.lang = 'zh-CN';
      setLocale('en');
      setLocale('en');
      expect(html.lang).toBe('en');
    });
  });

  it('切换语言时同步 lang', () => {
    withDocument((html) => {
      setLocale('ko');
      expect(html.lang).toBe('ko');
      setLocale('zh-TW');
      expect(html.lang).toBe('zh-TW');
    });
  });

  it('语言没变时不重复通知订阅者', () => {
    let calls = 0;
    const off = subscribeLocale(() => {
      calls += 1;
    });
    setLocale('en');
    expect(calls).toBe(0);
    setLocale('de');
    expect(calls).toBe(1);
    setLocale('en');
    expect(calls).toBe(2);
    off();
    setLocale('fr');
    expect(calls).toBe(2);
    setLocale('en');
  });
});

describe('错误文案跟随语言', () => {
  it('保险库错误按码取文案', () => {
    setLocale('en');
    expect(describeError(new VaultError('locked', '保险库已锁定'))).toBe('The vault is locked');
    setLocale('zh-CN');
    expect(describeError(new VaultError('locked', '保险库已锁定'))).toBe('保险库已锁定');
    setLocale('ja');
    expect(describeError(new VaultError('wrong-password', '主密码不正确'))).toBe(
      'マスターパスワードが正しくありません',
    );
    setLocale('en');
  });

  it('带键的错误优先用键，参数一起替换', () => {
    setLocale('en');
    expect(describeError(new UserError('error.base32.char', { ch: '1' }))).toBe(
      'The secret contains an invalid character: 1',
    );
    setLocale('ko');
    expect(describeError(new UserError('error.base32.char', { ch: '1' }))).toBe(
      '시크릿에 쓸 수 없는 문자가 있습니다: 1',
    );
    setLocale('en');
  });

  it('备份错误按原因区分', () => {
    setLocale('en');
    expect(describeError(new BackupError('magic', '这不是 Mercury 2FA 的备份文件'))).toBe(
      'This is not a Mercury 2FA backup',
    );
    setLocale('zh-TW');
    expect(describeError(new BackupError('version', '版本'))).toBe('目前版本不支援這個備份檔的版本');
    setLocale('en');
  });

  it('条数不符时报出两个数字', () => {
    setLocale('de');
    const error = new BackupError('structure', '数量不符', {
      key: 'error.backup.countMismatch',
      params: { declared: 9, actual: 2 },
    });
    expect(describeError(error)).toContain('9');
    expect(describeError(error)).toContain('2');
    setLocale('en');
  });

  it('没有键也没有码时退回原始消息', () => {
    setLocale('en');
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('not an error')).toBe('Unknown error');
  });
});
