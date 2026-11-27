import type { MessageKey, MessageParams } from './i18n/keys';

export type VaultErrorCode =
  | 'locked'
  | 'empty'
  | 'exists'
  | 'wrong-password'
  | 'invalid'
  | 'not-found'
  /** 后台超过 30 秒没有响应 */
  | 'timeout'
  /** 后台没有注册处理函数 */
  | 'no-handler'
  /** 返回值不合协议，被出站闸门拦下 */
  | 'protocol'
  | 'unknown';

const KNOWN_CODES: readonly string[] = [
  'locked',
  'empty',
  'exists',
  'wrong-password',
  'invalid',
  'not-found',
  'timeout',
  'no-handler',
  'protocol',
  'unknown',
];

export function asVaultErrorCode(value: unknown): VaultErrorCode {
  return typeof value === 'string' && KNOWN_CODES.includes(value) ? (value as VaultErrorCode) : 'unknown';
}

/**
 * 界面显示什么由 `key` 决定，`message` 只留给日志与测试。
 * 这样同一条错误在八种语言下都能出对应文案，而错误字符串本身不用跟着翻译。
 */
export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly key?: MessageKey;
  readonly params?: MessageParams;

  constructor(code: VaultErrorCode, message: string, extra?: { key?: MessageKey; params?: MessageParams }) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.key = extra?.key;
    this.params = extra?.params;
  }
}

/** 只带文案键、不带保险库状态的输入类错误：链接解析、种子校验、二维码识别 */
export class UserError extends Error {
  readonly key: MessageKey;
  readonly params?: MessageParams;

  constructor(key: MessageKey, params?: MessageParams, message?: string) {
    super(message ?? key);
    this.name = 'UserError';
    this.key = key;
    this.params = params;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof VaultError) return error.message;
  if (error instanceof Error) return error.message;
  return '未知错误';
}

/** 备份文件读不进来的三种情况，用户据此决定是换文件还是换密码 */
export type BackupErrorReason = 'json' | 'magic' | 'version' | 'structure';

export class BackupError extends VaultError {
  readonly reason: BackupErrorReason;

  constructor(
    reason: BackupErrorReason,
    message: string,
    extra?: { key?: MessageKey; params?: MessageParams },
  ) {
    super('invalid', message, {
      key: extra?.key ?? (`error.backup.${reason}` as MessageKey),
      params: extra?.params,
    });
    this.name = 'BackupError';
    this.reason = reason;
  }
}
