import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, normalizeSecret } from '../lib/base32';
import { hotp } from '../lib/hotp';
import { steamTotp, totp } from '../lib/totp';

const ascii = (text: string) => new TextEncoder().encode(text);
const seed = (text: string) => base32Encode(ascii(text));

const RFC4226_SEED = seed('12345678901234567890');
const RFC6238_SEED_SHA1 = seed('12345678901234567890');
const RFC6238_SEED_SHA256 = seed('12345678901234567890123456789012');
const RFC6238_SEED_SHA512 = seed('1234567890123456789012345678901234567890123456789012345678901234');

describe('base32', () => {
  it('往返编解码 20 字节 ASCII 种子', () => {
    const raw = ascii('12345678901234567890');
    const decoded = base32Decode(base32Encode(raw));
    expect(Array.from(decoded)).toEqual(Array.from(raw));
  });

  it('容忍空格、短横线、小写与多余补位', () => {
    expect(normalizeSecret(' gezd-gnbv gy3tqojq== ')).toBe('GEZDGNBVGY3TQOJQ');
  });

  it('拒绝非法字符与非法长度', () => {
    expect(() => normalizeSecret('GEZDGNBV1')).toThrow(/非法字符/);
    expect(() => normalizeSecret('GEZDGNBVX')).toThrow(/长度/);
  });
});

describe('HOTP — RFC 4226 附录 D 官方十组向量', () => {
  const vectors: Array<[number, string]> = [
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ];

  for (const [counter, expected] of vectors) {
    it(`counter = ${counter} → ${expected}`, async () => {
      await expect(hotp({ secret: RFC4226_SEED, counter, digits: 6 })).resolves.toBe(expected);
    });
  }
});

describe('TOTP — RFC 6238 附录 B 官方向量（8 位）', () => {
  const vectors: Array<[number, string, string, string]> = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];

  for (const [seconds, sha1, sha256, sha512] of vectors) {
    it(`T = ${seconds} 秒，三种摘要算法一致`, async () => {
      const base = { time: seconds * 1000, digits: 8 } as const;
      await expect(totp({ ...base, secret: RFC6238_SEED_SHA1, algorithm: 'SHA-1' })).resolves.toMatchObject({ code: sha1 });
      await expect(totp({ ...base, secret: RFC6238_SEED_SHA256, algorithm: 'SHA-256' })).resolves.toMatchObject({ code: sha256 });
      await expect(totp({ ...base, secret: RFC6238_SEED_SHA512, algorithm: 'SHA-512' })).resolves.toMatchObject({ code: sha512 });
    });
  }
});

describe('TOTP 时间窗口计算', () => {
  it('窗口末秒剩余时间与失效时刻正确', async () => {
    const result = await totp({ secret: RFC6238_SEED_SHA1, time: 59_000, digits: 6 });
    expect(result.step).toBe(1);
    expect(result.remaining).toBe(1);
    expect(result.expiresAt).toBe(60_000);
  });

  it('窗口首秒剩余 30 秒', async () => {
    const result = await totp({ secret: RFC6238_SEED_SHA1, time: 1_800_000, digits: 6 });
    expect(result.step).toBe(60);
    expect(result.remaining).toBe(30);
    expect(result.expiresAt).toBe(1_830_000);
  });

  it('同一窗口内取码稳定，跨窗口即变化', async () => {
    const a = await totp({ secret: RFC6238_SEED_SHA1, time: 1_000 });
    const b = await totp({ secret: RFC6238_SEED_SHA1, time: 29_000 });
    const c = await totp({ secret: RFC6238_SEED_SHA1, time: 31_000 });
    expect(a.code).toBe(b.code);
    expect(c.code).not.toBe(a.code);
  });

  it('2038 年之后的时间步不溢出', async () => {
    const result = await totp({ secret: RFC6238_SEED_SHA1, time: 2_000_000_000_000 });
    expect(result.step).toBe(66_666_666);
    expect(result.code).toMatch(/^\d{6}$/);
  });
});

describe('Steam 变体', () => {
  it('输出 5 位、只用自定义字母表', async () => {
    const result = await steamTotp(RFC6238_SEED_SHA1, 1_700_000_000_000);
    expect(result.code).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
    expect(result.period).toBe(30);
  });

  it('同一时间步结果稳定', async () => {
    const a = await steamTotp(RFC6238_SEED_SHA1, 1_700_000_000_000);
    const b = await steamTotp(RFC6238_SEED_SHA1, 1_700_000_009_000);
    expect(a.code).toBe(b.code);
  });
});
