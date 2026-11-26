const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * 宽容归一化：容忍空格、短横线、小写、多余补位。
 * 各家导出的种子格式不一致，先统一再解码。
 */
export function normalizeSecret(raw: string): string {
  const cleaned = raw
    .replace(/[\s\-_]/g, '')
    .replace(/=+$/, '')
    .toUpperCase();

  if (cleaned.length === 0) throw new Error('种子为空');
  for (const ch of cleaned) {
    if (!ALPHABET.includes(ch)) throw new Error(`种子含非法字符：${ch}`);
  }
  if (cleaned.length % 8 === 1) throw new Error('种子长度不合法');
  return cleaned;
}

export function base32Decode(input: string): Uint8Array {
  const text = normalizeSecret(input);
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of text) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
