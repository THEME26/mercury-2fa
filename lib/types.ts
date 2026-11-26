export type OtpType = 'totp' | 'hotp' | 'steam';

export type HmacAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

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

/** 送给界面的条目：不带种子 */
export type PublicEntry = Omit<OtpEntry, 'secret' | 'counter'>;

export interface EntryView extends PublicEntry {
  code: string;
  /** 本枚验证码失效的绝对时间，毫秒 */
  expiresAt: number;
  /** 当前时间步，HOTP 为计数器值 */
  step: number;
}
