import { describe, expect, it } from 'vitest';
import { isOtpAuthUri, parseOtpAuthUri } from '../lib/otpauth';

describe('otpauth:// 解析', () => {
  it('标准 TOTP 链接', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
    );
    expect(parsed).toMatchObject({
      type: 'totp',
      issuer: 'GitHub',
      account: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });
  });

  it('issuer 只写在 label 里也能取到', () => {
    const parsed = parseOtpAuthUri('otpauth://totp/AWS%20Root:bob?secret=JBSWY3DPEHPK3PXP');
    expect(parsed.issuer).toBe('AWS Root');
    expect(parsed.account).toBe('bob');
  });

  it('query 里的 issuer 优先于 label 前缀', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/Old:alice?secret=JBSWY3DPEHPK3PXP&issuer=New',
    );
    expect(parsed.issuer).toBe('New');
    expect(parsed.account).toBe('alice');
  });

  it('算法大小写与连字符写法都接受', () => {
    expect(parseOtpAuthUri('otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP&algorithm=sha256').algorithm).toBe('SHA-256');
    expect(parseOtpAuthUri('otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP&algorithm=SHA-512').algorithm).toBe('SHA-512');
  });

  it('自定义 digits 与 period', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP&digits=8&period=60',
    );
    expect(parsed.digits).toBe(8);
    expect(parsed.period).toBe(60);
  });

  it('HOTP 带计数器', () => {
    const parsed = parseOtpAuthUri('otpauth://hotp/A:b?secret=JBSWY3DPEHPK3PXP&counter=42');
    expect(parsed.type).toBe('hotp');
    expect(parsed.counter).toBe(42);
  });

  it('Steam 类型', () => {
    const parsed = parseOtpAuthUri('otpauth://steam/Steam:player?secret=JBSWY3DPEHPK3PXP');
    expect(parsed.type).toBe('steam');
    expect(parsed.issuer).toBe('Steam');
  });

  it('缺少 secret、类型错误、非 otpauth 链接都会报错', () => {
    expect(() => parseOtpAuthUri('otpauth://totp/A:b')).toThrow(/secret/);
    expect(() => parseOtpAuthUri('otpauth://motp/A:b?secret=JBSWY3DPEHPK3PXP')).toThrow(/不支持的类型/);
    expect(() => parseOtpAuthUri('https://example.com')).toThrow(/不是 otpauth/);
    expect(() => parseOtpAuthUri('这不是链接')).toThrow(/无法解析/);
  });

  it('参数越界会拒绝', () => {
    expect(() => parseOtpAuthUri('otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP&digits=99')).toThrow(/digits/);
    expect(() => parseOtpAuthUri('otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP&period=0')).toThrow(/period/);
    expect(() => parseOtpAuthUri('otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP&algorithm=MD5')).toThrow(/算法/);
  });

  it('识别 otpauth 前缀', () => {
    expect(isOtpAuthUri('  OTPAUTH://totp/A:b?secret=X')).toBe(true);
    expect(isOtpAuthUri('otpauth-migration://offline?data=x')).toBe(false);
  });
});
