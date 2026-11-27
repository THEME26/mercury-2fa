import { BackupError, UserError, VaultError } from '../errors';
import { t } from './index';
import type { MessageKey } from './keys';

const CODE_KEYS: Partial<Record<string, MessageKey>> = {
  locked: 'error.locked',
  empty: 'error.empty',
  exists: 'error.exists',
  'wrong-password': 'error.wrongPassword',
  invalid: 'error.invalid',
  'not-found': 'error.notFound',
  timeout: 'error.timeout',
  'no-handler': 'error.noHandler',
  protocol: 'error.protocol',
  unknown: 'error.unknown',
};

/**
 * 界面上所有错误文案都从这里出。
 * 优先用错误自带的键，其次按保险库错误码，最后才退回原始 message ——
 * 最后这一档只会出现在未预期的异常上，正常路径不应命中。
 */
export function describeError(error: unknown): string {
  if (error instanceof UserError) return t(error.key, error.params);
  if (error instanceof BackupError) {
    return t(error.key ?? (`error.backup.${error.reason}` as MessageKey), error.params);
  }
  if (error instanceof VaultError) {
    if (error.key) return t(error.key, error.params);
    const key = CODE_KEYS[error.code];
    return key ? t(key) : t('error.unknown');
  }
  if (error instanceof Error) return error.message;
  return t('error.unknown');
}
