import { describe, expect, it } from 'vitest';
import { base32Encode } from '../lib/base32';
import { parseImportText, parseMigrationUri } from '../lib/importers';

const vint = (value: number): number[] => {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte |= 0x80;
    out.push(byte);
  } while (rest > 0);
  return out;
};

const ld = (field: number, payload: number[]): number[] => [...vint(field * 8 + 2), ...vint(payload.length), ...payload];
const vi = (field: number, value: number): number[] => [...vint(field * 8), ...vint(value)];
const utf8 = (text: string): number[] => [...new TextEncoder().encode(text)];

const TOTP_SECRET = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03];
const HOTP_SECRET = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa];

function buildMigrationUri(): string {
  const totp = [
    ...ld(1, TOTP_SECRET),
    ...ld(2, utf8('alice@gmail.com')),
    ...ld(3, utf8('GitHub')),
    ...vi(4, 1),
    ...vi(5, 1),
    ...vi(6, 2),
  ];
  const hotp = [
    ...ld(1, HOTP_SECRET),
    ...ld(2, utf8('Bank:admin')),
    ...ld(3, utf8('Bank')),
    ...vi(4, 2),
    ...vi(5, 2),
    ...vi(6, 1),
    ...vi(7, 42),
  ];
  const payload = [...ld(1, totp), ...ld(1, hotp), ...vi(2, 1)];
  const base64 = btoa(String.fromCharCode(...payload));
  return `otpauth-migration://offline?data=${encodeURIComponent(base64)}`;
}

describe('Google Authenticator 迁移码', () => {
  it('解析出 TOTP 与 HOTP 两条，参数正确', () => {
    const entries = parseMigrationUri(buildMigrationUri());
    expect(entries).toHaveLength(2);

    expect(entries[0]).toMatchObject({
      type: 'totp',
      issuer: 'GitHub',
      account: 'alice@gmail.com',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });
    expect(entries[0]!.secret).toBe(base32Encode(Uint8Array.from(TOTP_SECRET)));

    expect(entries[1]).toMatchObject({
      type: 'hotp',
      issuer: 'Bank',
      account: 'admin',
      algorithm: 'SHA-256',
      digits: 8,
      counter: 42,
    });
  });

  it('拒绝非迁移链接与损坏数据', () => {
    expect(() => parseMigrationUri('otpauth://totp/A:b?secret=X')).toThrow(/迁移链接/);
    expect(() => parseMigrationUri('otpauth-migration://offline?data=@@@')).toThrow();
  });
});

describe('JSON 备份识别', () => {
  it('Aegis', () => {
    const text = JSON.stringify({
      version: 1,
      db: {
        version: 2,
        entries: [
          {
            type: 'totp',
            uuid: 'u1',
            name: 'alice@example.com',
            issuer: 'GitHub',
            info: { secret: 'jbswy3dp ehpk3pxp', algo: 'SHA1', digits: 6, period: 30 },
          },
        ],
      },
    });
    const result = parseImportText(text);
    expect(result.source).toBe('Aegis');
    expect(result.entries[0]).toMatchObject({
      issuer: 'GitHub',
      account: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
    });
  });

  it('Aegis 加密备份给出明确提示', () => {
    const text = JSON.stringify({ db: { encrypted: true, entries: [] } });
    expect(() => parseImportText(text)).toThrow(/已加密/);
  });

  it('2FAS', () => {
    const text = JSON.stringify({
      schemaVersion: 4,
      services: [
        {
          name: 'GitHub',
          secret: 'JBSWY3DPEHPK3PXP',
          otp: {
            label: 'GitHub',
            account: 'alice@example.com',
            issuer: 'GitHub',
            digits: 6,
            period: 30,
            algorithm: 'SHA1',
            counter: 0,
            tokenType: 'TOTP',
          },
        },
      ],
    });
    const result = parseImportText(text);
    expect(result.source).toBe('2FAS');
    expect(result.entries[0]).toMatchObject({ issuer: 'GitHub', account: 'alice@example.com' });
  });

  it('andOTP', () => {
    const text = JSON.stringify([
      {
        secret: 'JBSWY3DPEHPK3PXP',
        issuer: 'GitHub',
        label: 'alice',
        digits: 6,
        type: 'TOTP',
        algorithm: 'SHA1',
        period: 30,
      },
    ]);
    const result = parseImportText(text);
    expect(result.source).toBe('andOTP');
    expect(result.entries[0]!.account).toBe('alice');
  });

  it('Bitwarden 里 otpauth 链接与裸种子都能认', () => {
    const text = JSON.stringify({
      items: [
        { name: 'GitHub', login: { username: 'alice', totp: 'otpauth://totp/GitHub:alice?secret=JBSWY3DPEHPK3PXP' } },
        { name: 'AWS', login: { username: 'ops', totp: 'KRSXG5CTMVRXEZLU' } },
        { name: 'NoOtp', login: { username: 'x' } },
      ],
    });
    const result = parseImportText(text);
    expect(result.source).toBe('Bitwarden');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]).toMatchObject({ issuer: 'AWS', account: 'ops' });
  });

  it('otpauth 链接串一次导入多条', () => {
    const text = [
      'otpauth://totp/A:a?secret=JBSWY3DPEHPK3PXP',
      'otpauth://totp/B:b?secret=KRSXG5CTMVRXEZLU',
    ].join('\n');
    expect(parseImportText(text).entries).toHaveLength(2);
  });

  it('自家加密备份走专门入口，不走这里', () => {
    const text = JSON.stringify({ format: 'mercury-2fa-backup', version: 2, vault: {} });
    expect(() => parseImportText(text)).toThrow(/加密备份/);
  });

  it('无法识别的内容报错', () => {
    expect(() => parseImportText('hello world')).toThrow(/无法识别/);
    expect(() => parseImportText('{"foo":1}')).toThrow(/无法识别/);
  });
});
