export type OtpType = 'totp' | 'hotp' | 'steam';

export type HmacAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export type KdfTier = 'low' | 'medium' | 'high';

/** 派生强度预设，m 的单位是 KiB，与 argon2 参考实现的 m_cost 一致 */
export const KDF_TIERS: Record<KdfTier, { m: number; t: number; p: number; label: string }> = {
  low: { m: 19 * 1024, t: 2, p: 1, label: '低（约 100ms，老机器）' },
  medium: { m: 64 * 1024, t: 3, p: 1, label: '中（约 400ms，推荐）' },
  high: { m: 256 * 1024, t: 4, p: 1, label: '高（约 1.5s，强口令）' },
};

export interface OtpEntry {
  id: string;
  type: OtpType;
  issuer: string;
  account: string;
  /** 归一化后的 base32 种子，大写、无分隔符、无补位 */
  secret: string;
  algorithm: HmacAlgorithm;
  digits: number;
  period: number;
  /** 仅 HOTP 使用，取码后由调用方递增落盘 */
  counter?: number;
  createdAt: number;
}

export interface EntryRecord extends OtpEntry {
  pinned?: boolean;
}

/** 送给界面的条目：不带种子 */
export interface EntryView {
  id: string;
  type: OtpType;
  issuer: string;
  account: string;
  digits: number;
  period: number;
  pinned: boolean;
  /** 同一个种子被多个条目使用：任意一处泄露，两个账号同时失守 */
  sharedSecret?: boolean;
  code: string;
  /** 失效的绝对时间，毫秒；HOTP 为 0 表示固定不变 */
  expiresAt: number;
  step: number;
}

export interface Settings {
  /** 空闲多久后自动回到锁定态 */
  lockAfterMs: number;
  /** 复制后多少毫秒清空剪贴板，0 表示不清 */
  clipboardClearMs: number;
  kdfTier: KdfTier;
  /** 上次导出加密备份的绝对时间，用于算备份健康度 */
  lastBackupAt?: number;
}

export interface VaultStatus {
  state: 'empty' | 'locked' | 'unlocked';
  /** 存在 v0.1 的明文库 */
  hasLegacy: boolean;
  entryCount: number;
  kdf: { m: number; t: number; p: number } | null;
  settings: Settings;
}

export interface ManualInput {
  type: OtpType;
  issuer: string;
  account: string;
  secret: string;
  algorithm?: HmacAlgorithm;
  digits?: number;
  period?: number;
  counter?: number;
}

export interface NewEntryInput {
  uri?: string;
  manual?: ManualInput;
}
