export type VaultErrorCode =
  | 'locked'
  | 'empty'
  | 'exists'
  | 'wrong-password'
  | 'invalid'
  | 'not-found';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
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

  constructor(reason: BackupErrorReason, message: string) {
    super('invalid', message);
    this.name = 'BackupError';
    this.reason = reason;
  }
}
