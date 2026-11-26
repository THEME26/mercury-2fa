import { hotp, steamCode } from './hotp';
import type { HmacAlgorithm } from './types';

export interface TotpOptions {
  secret: string | Uint8Array;
  /** 毫秒时间戳，默认取当前时间 */
  time?: number;
  period?: number;
  digits?: number;
  algorithm?: HmacAlgorithm;
}

export interface TotpResult {
  code: string;
  /** 当前时间步，等于 floor(unix秒 / period) */
  step: number;
  /** 距离失效还剩多少秒 */
  remaining: number;
  /** 失效的绝对时间，毫秒 */
  expiresAt: number;
  period: number;
}

export function timeStep(nowMs: number, period: number): number {
  return Math.floor(nowMs / 1000 / period);
}

export async function totp(options: TotpOptions): Promise<TotpResult> {
  const period = options.period ?? 30;
  const now = options.time ?? Date.now();
  const step = timeStep(now, period);
  const nowSec = Math.floor(now / 1000);

  const code = await hotp({
    secret: options.secret,
    counter: step,
    digits: options.digits ?? 6,
    algorithm: options.algorithm ?? 'SHA-1',
  });

  const remaining = period - (nowSec % period);
  return { code, step, remaining, expiresAt: (nowSec + remaining) * 1000, period };
}

export async function steamTotp(secret: string | Uint8Array, now = Date.now()): Promise<TotpResult> {
  const period = 30;
  const step = timeStep(now, period);
  const nowSec = Math.floor(now / 1000);
  const code = await steamCode(secret, step);
  const remaining = period - (nowSec % period);
  return { code, step, remaining, expiresAt: (nowSec + remaining) * 1000, period };
}
