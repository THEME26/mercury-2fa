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
