import { base32Encode, normalizeSecret } from './base32';
import { parseOtpAuthUri, type ParsedOtpAuth } from './otpauth';
import type { HmacAlgorithm, OtpType } from './types';

export interface ImportResult {
  source: string;
  entries: ParsedOtpAuth[];
  skipped: number;
}

const textDecoder = new TextDecoder();

function mapAlgorithm(raw: unknown): HmacAlgorithm {
  if (typeof raw !== 'string') return 'SHA-1';
  const key = raw.toUpperCase().replace(/[-_]/g, '');
  if (key === 'SHA256') return 'SHA-256';
  if (key === 'SHA512') return 'SHA-512';
  return 'SHA-1';
}

function num(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** 极简 varint 读取器，够解析 Google Authenticator 的迁移 protobuf */
class Reader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= this.buf.length) throw new Error('protobuf varint 越界');
      const byte = this.buf[this.pos++] ?? 0;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 63) throw new Error('protobuf varint 过长');
    }
    return result;
  }

  bytes(): Uint8Array {
    const length = this.varint();
    if (this.pos + length > this.buf.length) throw new Error('protobuf 长度越界');
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  skip(wireType: number): void {
    if (wireType === 0) this.varint();
    else if (wireType === 2) this.bytes();
    else if (wireType === 5) this.pos += 4;
    else if (wireType === 1) this.pos += 8;
    else throw new Error(`不支持的 protobuf 编码：${wireType}`);
  }
}

interface MigrationParams {
  secret: Uint8Array;
  name: string;
  issuer: string;
  algorithm: number;
  digits: number;
  type: number;
  counter: number;
}

function parseMigrationParams(chunk: Uint8Array): MigrationParams {
  const reader = new Reader(chunk);
  const params: MigrationParams = {
    secret: new Uint8Array(),
    name: '',
    issuer: '',
    algorithm: 0,
    digits: 0,
    type: 0,
    counter: 0,
  };

  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) params.secret = reader.bytes();
    else if (field === 2 && wire === 2) params.name = textDecoder.decode(reader.bytes());
    else if (field === 3 && wire === 2) params.issuer = textDecoder.decode(reader.bytes());
    else if (field === 4 && wire === 0) params.algorithm = reader.varint();
    else if (field === 5 && wire === 0) params.digits = reader.varint();
    else if (field === 6 && wire === 0) params.type = reader.varint();
    else if (field === 7 && wire === 0) params.counter = reader.varint();
    else reader.skip(wire);
  }
  return params;
}

/** otpauth-migration://offline?data=<base64url protobuf> */
export function parseMigrationUri(uri: string): ParsedOtpAuth[] {
  const match = /^otpauth-migration:\/\/offline\?data=([A-Za-z0-9\-_%+=\/]+)/i.exec(uri.trim());
  if (!match) throw new Error('不是 Google Authenticator 迁移链接');

  const encoded = decodeURIComponent(match[1] ?? '');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const buf = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));

  const reader = new Reader(buf);
  const results: ParsedOtpAuth[] = [];

  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const params = parseMigrationParams(reader.bytes());
      if (params.secret.length === 0) continue;
      const algorithm = params.algorithm === 2 ? 'SHA-256' : params.algorithm === 3 ? 'SHA-512' : 'SHA-1';
      if (params.algorithm === 4) continue;
      const type: OtpType = params.type === 1 ? 'hotp' : 'totp';
      const [issuerFromName, accountFromName] = splitLabel(params.name);
      results.push({
        type,
        issuer: params.issuer || issuerFromName,
        account: accountFromName || params.name,
        secret: base32Encode(params.secret),
        algorithm,
        digits: params.digits === 2 ? 8 : 6,
        period: 30,
        counter: type === 'hotp' ? params.counter : undefined,
      });
    } else {
      reader.skip(wire);
    }
  }

  if (results.length === 0) throw new Error('迁移码里没有可导入的条目');
  return results;
}

function splitLabel(name: string): [string, string] {
  const index = name.indexOf(':');
  if (index < 0) return ['', name];
  return [name.slice(0, index).trim(), name.slice(index + 1).trim()];
}

function fail(message: string): never {
  throw new Error(message);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pick(record: unknown, key: string): unknown {
  return record !== null && typeof record === 'object' ? (record as Record<string, unknown>)[key] : undefined;
}

function normalizeEntry(entry: {
  type: OtpType;
  issuer: string;
  account: string;
  secret: unknown;
  algorithm?: unknown;
  digits?: unknown;
  period?: unknown;
  counter?: unknown;
}): ParsedOtpAuth {
  const secret = normalizeSecret(String(entry.secret ?? ''));
  const isSteam = entry.type === 'steam';
  return {
    type: entry.type,
    issuer: entry.issuer.trim(),
    account: entry.account.trim(),
    secret,
    algorithm: isSteam ? 'SHA-1' : mapAlgorithm(entry.algorithm),
    digits: isSteam ? 5 : num(entry.digits, 6),
    period: isSteam ? 30 : num(entry.period, 30),
    counter: entry.type === 'hotp' ? num(entry.counter, 0) : undefined,
  };
}

function parseAegis(root: unknown): ParsedOtpAuth[] {
  const db = pick(root, 'db');
  if (pick(db, 'encrypted') === true) fail('Aegis 备份已加密，请先导出未加密版本');
  const entries = asArray(pick(db, 'entries'));
  return entries.map((raw) => {
    const info = pick(raw, 'info');
    const type = str(pick(raw, 'type')).toLowerCase() === 'hotp' ? 'hotp' : 'totp';
    return normalizeEntry({
      type,
      issuer: str(pick(raw, 'issuer')),
      account: str(pick(raw, 'name')),
      secret: pick(info, 'secret'),
      algorithm: pick(info, 'algo'),
      digits: pick(info, 'digits'),
      period: pick(info, 'period'),
      counter: pick(info, 'counter'),
    });
  });
}

function parse2Fas(root: unknown): ParsedOtpAuth[] {
  return asArray(pick(root, 'services')).map((raw) => {
    const otp = pick(raw, 'otp');
    const type = str(pick(otp, 'tokenType')).toLowerCase() === 'hotp' ? 'hotp' : 'totp';
    return normalizeEntry({
      type,
      issuer: str(pick(otp, 'issuer')) || str(pick(raw, 'name')),
      account: str(pick(otp, 'account')) || str(pick(raw, 'name')),
      secret: pick(raw, 'secret'),
      algorithm: pick(otp, 'algorithm'),
      digits: pick(otp, 'digits'),
      period: pick(otp, 'period'),
      counter: pick(otp, 'counter'),
    });
  });
}

function parseAndOtp(root: unknown): ParsedOtpAuth[] {
  return asArray(root).map((raw) =>
    normalizeEntry({
      type: str(pick(raw, 'type')).toLowerCase() === 'hotp' ? 'hotp' : 'totp',
      issuer: str(pick(raw, 'issuer')),
      account: str(pick(raw, 'label')),
      secret: pick(raw, 'secret'),
      algorithm: pick(raw, 'algorithm'),
      digits: pick(raw, 'digits'),
      period: pick(raw, 'period'),
      counter: pick(raw, 'counter'),
    }),
  );
}

function parseBitwarden(root: unknown): ParsedOtpAuth[] {
  const out: ParsedOtpAuth[] = [];
  for (const item of asArray(pick(root, 'items'))) {
    const login = pick(item, 'login');
    const totp = pick(login, 'totp');
    if (typeof totp !== 'string' || totp.trim() === '') continue;
    if (totp.toLowerCase().startsWith('otpauth://')) {
      out.push(parseOtpAuthUri(totp));
      continue;
    }
    out.push(
      normalizeEntry({
        type: 'totp',
        issuer: str(pick(item, 'name')),
        account: str(pick(login, 'username')),
        secret: totp,
      }),
    );
  }
  return out;
}

/**
 * 统一入口：按内容特征识别来源，返回标准化条目。
 * 支持的来源：GA 迁移链接、otpauth 链接串、Aegis、2FAS、andOTP、Bitwarden。
 */
export function parseImportText(text: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed === '') throw new Error('内容为空');

  if (/^otpauth-migration:\/\//i.test(trimmed)) {
    return { source: 'Google Authenticator 迁移码', entries: parseMigrationUri(trimmed), skipped: 0 };
  }

  if (/^otpauth:\/\//i.test(trimmed)) {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
    const entries = lines.map((line) => parseOtpAuthUri(line));
    return { source: 'otpauth 链接', entries, skipped: 0 };
  }

  let root: unknown;
  try {
    root = JSON.parse(trimmed);
  } catch {
    throw new Error('无法识别的内容，既不是 otpauth 链接也不是 JSON');
  }

  if (pick(root, 'format') === 'mercury-2fa-backup') {
    throw new Error('这是 Mercury 的加密备份，请用「导入加密备份」入口');
  }

  const attempts: Array<[string, (value: unknown) => ParsedOtpAuth[]]> = [
    ['Aegis', parseAegis],
    ['2FAS', parse2Fas],
    ['andOTP', parseAndOtp],
    ['Bitwarden', parseBitwarden],
  ];

  const errors: string[] = [];
  for (const [name, parse] of attempts) {
    const hasShape =
      (name === 'Aegis' && pick(pick(root, 'db'), 'entries') !== undefined) ||
      (name === '2FAS' && pick(root, 'services') !== undefined) ||
      (name === 'andOTP' && Array.isArray(root)) ||
      (name === 'Bitwarden' && pick(root, 'items') !== undefined);
    if (!hasShape) continue;

    let raw: ParsedOtpAuth[] = [];
    try {
      raw = parse(root);
    } catch (error) {
      errors.push(`${name}: ${(error as Error).message}`);
      continue;
    }

    const entries: ParsedOtpAuth[] = [];
    let skipped = 0;
    for (const entry of raw) {
      try {
        entries.push({ ...entry, secret: normalizeSecret(entry.secret) });
      } catch {
        skipped += 1;
      }
    }
    if (entries.length === 0) throw new Error(`${name} 备份里没有可导入的条目`);
    return { source: name, entries, skipped };
  }

  if (errors.length > 0) throw new Error(errors[0]);
  throw new Error('无法识别的 JSON 结构，支持 Aegis / 2FAS / andOTP / Bitwarden');
}
