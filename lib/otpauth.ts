import { normalizeSecret } from './base32';
import type { HmacAlgorithm, OtpType } from './types';

export interface ParsedOtpAuth {
  type: OtpType;
  issuer: string;
  account: string;
  secret: string;
  algorithm: HmacAlgorithm;
  digits: number;
  period: number;
  counter?: number;
}

export function isOtpAuthUri(value: string): boolean {
  return /^otpauth:\/\//i.test(value.trim());
}

function mapAlgorithm(raw: string | null): HmacAlgorithm {
  if (raw === null || raw.trim() === '') return 'SHA-1';
  const key = raw.trim().toUpperCase().replace(/[-_]/g, '');
  if (key === 'SHA1') return 'SHA-1';
  if (key === 'SHA256') return 'SHA-256';
  if (key === 'SHA512') return 'SHA-512';
  throw new Error(`不支持的算法：${raw}`);
}

function intParam(
  raw: string | null,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} 取值不合法：${raw}`);
  }
  return value;
}

/**
 * 解析 otpauth://totp/Issuer:account?secret=...&issuer=...
 * 对常见的不规范写法容忍：算法大小写、缺省 period/digits、issuer 只在 label 里。
 */
export function parseOtpAuthUri(uri: string): ParsedOtpAuth {
  const text = uri.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('链接格式无法解析');
  }
  if (url.protocol !== 'otpauth:') throw new Error('不是 otpauth:// 链接');

  const host = url.hostname.toLowerCase();
  if (host !== 'totp' && host !== 'hotp' && host !== 'steam') {
    throw new Error(`不支持的类型：${host || '(空)'}`);
  }

  const rawLabel = url.pathname.replace(/^\//, '');
  let label: string;
  try {
    label = decodeURIComponent(rawLabel);
  } catch {
    throw new Error('标签含有非法的百分号编码');
  }

  const colon = label.indexOf(':');
  const issuerFromLabel = colon >= 0 ? label.slice(0, colon).trim() : '';
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim();

  const queryIssuer = (url.searchParams.get('issuer') ?? '').trim();
  const secretRaw = url.searchParams.get('secret');
  if (secretRaw === null || secretRaw.trim() === '') throw new Error('链接里没有 secret 参数');

  const type = host as OtpType;
  const parsed: ParsedOtpAuth = {
    type,
    issuer: queryIssuer || issuerFromLabel,
    account,
    secret: normalizeSecret(secretRaw),
    algorithm: mapAlgorithm(url.searchParams.get('algorithm')),
    digits: intParam(url.searchParams.get('digits'), 'digits', 6, 4, 10),
    period: intParam(url.searchParams.get('period'), 'period', 30, 1, 600),
  };

  if (type === 'hotp') {
    parsed.counter = intParam(url.searchParams.get('counter'), 'counter', 0, 0, Number.MAX_SAFE_INTEGER);
  }
  return parsed;
}
