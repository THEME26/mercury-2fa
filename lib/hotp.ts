import { base32Decode } from './base32';
import type { HmacAlgorithm } from './types';

/** Steam 用 26 个字符的自定义字母表，避开易混字符 */
const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export async function hmac(
  algorithm: HmacAlgorithm,
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('HMAC', cryptoKey, toArrayBuffer(data));
  return new Uint8Array(signature);
}

/** 计数器转 8 字节大端；用 BigInt 防止 2038 之后的时间步溢出 */
export function counterToBytes(counter: number | bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let remaining = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return buf;
}

/** RFC 4226 §5.3 动态截断：取末字节低 4 位作偏移，读 4 字节并剥掉符号位 */
export function dynamicTruncate(digest: Uint8Array): number {
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const first = digest[offset] ?? 0;
  const second = digest[offset + 1] ?? 0;
  const third = digest[offset + 2] ?? 0;
  const fourth = digest[offset + 3] ?? 0;
  return ((first & 0x7f) << 24) | (second << 16) | (third << 8) | fourth;
}

export function formatCode(value: number, digits: number): string {
  return String(value % 10 ** digits).padStart(digits, '0');
}

export interface HotpOptions {
  secret: string | Uint8Array;
  counter: number | bigint;
  digits?: number;
  algorithm?: HmacAlgorithm;
}

export async function hotp(options: HotpOptions): Promise<string> {
  const { counter, digits = 6, algorithm = 'SHA-1' } = options;
  const key = typeof options.secret === 'string' ? base32Decode(options.secret) : options.secret;
  const digest = await hmac(algorithm, key, counterToBytes(counter));
  return formatCode(dynamicTruncate(digest), digits);
}

export async function steamCode(
  secret: string | Uint8Array,
  counter: number | bigint,
): Promise<string> {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  const digest = await hmac('SHA-1', key, counterToBytes(counter));
  let value = dynamicTruncate(digest);
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += STEAM_ALPHABET[value % 26];
    value = Math.floor(value / 26);
  }
  return out;
}
