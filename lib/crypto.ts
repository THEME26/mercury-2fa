import { argon2id } from 'hash-wasm';
import { BackupError, VaultError } from './errors';
import { KDF_TIERS, type KdfTier } from './types';

export { KDF_TIERS };
export type { KdfTier };

/** Argon2id 参数，m 的单位是 KiB，与 argon2 参考实现的 m_cost 一致 */
export interface Argon2Params {
  name: 'argon2id';
  m: number;
  t: number;
  p: number;
  salt: string;
}

export interface Sealed {
  iv: string;
  data: string;
}

export interface VaultV2 {
  schemaVersion: 2;
  kdf: Argon2Params;
  wrappedDek: Sealed;
  payload: Sealed;
  /** 明文条目总数，只用于恢复时核对完整性，不泄露内容 */
  entryCount?: number;
  createdAt: number;
  updatedAt: number;
}

const DEK_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveKek(password: string, params: Argon2Params): Promise<Uint8Array> {
  const hash = await argon2id({
    password,
    salt: fromBase64(params.salt),
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: DEK_BYTES,
    outputType: 'binary',
  });
  return hash as Uint8Array;
}

export async function aesEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const cryptoKey = await crypto.subtle.importKey('raw', toArrayBuffer(key), 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(plaintext),
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

export async function aesDecrypt(key: Uint8Array, sealed: Sealed): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', toArrayBuffer(key), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(sealed.iv)) },
    cryptoKey,
    toArrayBuffer(fromBase64(sealed.data)),
  );
  return new Uint8Array(plain);
}

export function makeKdfParams(tier: KdfTier): Argon2Params {
  const preset = KDF_TIERS[tier];
  return { name: 'argon2id', m: preset.m, t: preset.t, p: preset.p, salt: toBase64(randomBytes(SALT_BYTES)) };
}

export function isWrongPassword(error: unknown): boolean {
  if (error instanceof VaultError && error.code === 'wrong-password') return true;
  const name = (error as { name?: string } | null)?.name;
  return name === 'OperationError';
}

/** 密文的字节长度，用于自检与显示 */
export function sealedSize(sealed: Sealed): number {
  return Math.floor((sealed.data.length * 3) / 4);
}

async function wrapDek(kek: Uint8Array, dek: Uint8Array): Promise<Sealed> {
  return aesEncrypt(kek, dek);
}

async function unwrapDek(kek: Uint8Array, sealed: Sealed): Promise<Uint8Array> {
  return aesDecrypt(kek, sealed);
}

export interface CreatedVault {
  vault: VaultV2;
  dek: Uint8Array;
}

/** 首次创建保险库：随机 DEK 用 KEK 包起来，条目用 DEK 加密 */
export async function createVault(
  password: string,
  entries: unknown,
  tier: KdfTier = 'medium',
  now = Date.now(),
): Promise<CreatedVault> {
  const kdf = makeKdfParams(tier);
  const kek = await deriveKek(password, kdf);
  const dek = randomBytes(DEK_BYTES);
  const vault: VaultV2 = {
    schemaVersion: 2,
    kdf,
    wrappedDek: await wrapDek(kek, dek),
    payload: await aesEncrypt(dek, new TextEncoder().encode(JSON.stringify(entries))),
    entryCount: Array.isArray(entries) ? entries.length : 0,
    createdAt: now,
    updatedAt: now,
  };
  return { vault, dek };
}

export interface OpenedVault {
  dek: Uint8Array;
  entries: unknown;
}

export async function openVault(vault: VaultV2, password: string): Promise<OpenedVault> {
  const kek = await deriveKek(password, vault.kdf);
  let dek: Uint8Array;
  try {
    dek = await unwrapDek(kek, vault.wrappedDek);
  } catch {
    /** DEK 解包失败只可能是 KEK 不对，即密码错 */
    throw new VaultError('wrong-password', '主密码不正确');
  }
  /** 走到这里密码是对的，再解密失败说明库体被改过 */
  let plain: Uint8Array;
  try {
    plain = await aesDecrypt(dek, vault.payload);
  } catch {
    throw new BackupError('structure', '数据无法解密，内容可能已损坏');
  }
  try {
    return { dek, entries: JSON.parse(new TextDecoder().decode(plain)) };
  } catch {
    throw new BackupError('structure', '库体内容无法解析，文件可能已损坏');
  }
}

export async function sealEntries(vault: VaultV2, dek: Uint8Array, entries: unknown): Promise<VaultV2> {
  return {
    ...vault,
    payload: await aesEncrypt(dek, new TextEncoder().encode(JSON.stringify(entries))),
    updatedAt: Date.now(),
  };
}

/** 改主密码：KEK 换代重包同一个 DEK，库体不动 */
export async function rewrapVault(
  vault: VaultV2,
  dek: Uint8Array,
  newPassword: string,
  tier?: KdfTier,
): Promise<VaultV2> {
  const kdf: Argon2Params = tier
    ? makeKdfParams(tier)
    : { ...vault.kdf, salt: toBase64(randomBytes(SALT_BYTES)) };
  const kek = await deriveKek(newPassword, kdf);
  return {
    ...vault,
    kdf,
    wrappedDek: await wrapDek(kek, dek),
    updatedAt: Date.now(),
  };
}

/** 导出用的便携格式：把 kdf 参数、密文一起带上，迁移不丢参数 */
export interface BackupFile {
  format: 'mercury-2fa-backup';
  version: 2;
  exportedAt: string;
  /** 明文条目总数，与 vault.entryCount 一致，恢复后核对 */
  entryCount: number;
  vault: VaultV2;
}

export const BACKUP_FORMAT = 'mercury-2fa-backup';
export const BACKUP_VERSION = 2;

export function makeBackup(vault: VaultV2): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entryCount: vault.entryCount ?? 0,
    vault,
  };
}

/** 只认自己的命名空间与版本，不兼容外部格式 */
export function parseBackup(text: string): VaultV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('json', '备份文件已损坏，无法解析');
  }
  const file = parsed as Partial<BackupFile>;
  if (!file || typeof file !== 'object' || file.format !== BACKUP_FORMAT) {
    throw new BackupError('magic', '这不是 Mercury 2FA 的备份文件');
  }
  if (typeof file.version !== 'number') {
    throw new BackupError('version', '备份文件缺少版本信息');
  }
  if (file.version > BACKUP_VERSION) {
    throw new BackupError('version', '备份文件来自更新版本的扩展，请先升级后再恢复');
  }
  if (file.vault?.schemaVersion !== 2) {
    throw new BackupError('version', '备份文件的数据版本不受支持');
  }
  if (typeof file.vault.payload?.data !== 'string' || typeof file.vault.wrappedDek?.data !== 'string') {
    throw new BackupError('structure', '备份文件内容不完整，可能被截断');
  }
  /** AES-GCM 的认证标签固定 16 字节，密文短于此必然是截断 */
  try {
    if (fromBase64(file.vault.payload.data).length < 16 || fromBase64(file.vault.wrappedDek.data).length < 16) {
      throw new BackupError('structure', '备份文件内容不完整，密文长度异常');
    }
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('structure', '备份文件中的密文不是合法 base64');
  }
  return file.vault;
}
