export type OtpType = 'totp' | 'hotp' | 'steam';

export type HmacAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export type KdfTier = 'low' | 'medium' | 'high';

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
