import { browser } from 'wxt/browser';
import { asVaultErrorCode, BackupError, VaultError, type BackupErrorReason } from './errors';
import type { MessageKey } from './i18n/keys';
import { isReply, type VaultCommand } from './protocol';
import type { EntryView, KdfTier, NewEntryInput, Settings, VaultStatus } from './types';
import type { SelfTestReport } from './vault-service';

const BACKUP_REASONS: readonly string[] = ['json', 'magic', 'version', 'structure'];

/** Argon2id 高档在慢机器上要 1.5s，加上导入解密，超时给足 */
const TIMEOUT_MS = 30_000;

async function send<T>(command: VaultCommand): Promise<T> {
  const message = { target: 'vault' as const, ...command };
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = self.setTimeout(() => reject(new VaultError('timeout', '后台无响应，请关闭弹窗后重试')), TIMEOUT_MS);
  });

  try {
    const reply = await Promise.race([browser.runtime.sendMessage(message), timeout]);
    if (!isReply(reply)) throw new VaultError('no-handler', '后台没有返回结果，请重试');
    if (!reply.ok) {
      const { code, message: text, key, params, reason } = reply.error;
      /** 备份错误按原因重建，界面据此区分换文件还是换密码 */
      if (typeof reason === 'string' && BACKUP_REASONS.includes(reason)) {
        throw new BackupError(reason as BackupErrorReason, text);
      }
      throw new VaultError(asVaultErrorCode(code), text, {
        key: typeof key === 'string' ? (key as MessageKey) : undefined,
        params,
      });
    }
    return reply.data as T;
  } finally {
    self.clearTimeout(timer);
  }
}

/**
 * popup 侧的保险库客户端。签名与 VaultService 一致，实现是把命令发给 service worker，
 * 由它转给 offscreen 执行。popup 里没有任何解密代码路径，拿不到种子，也拿不到 DEK。
 */
export const vaultService = {
  status: (): Promise<VaultStatus> => send({ op: 'status' }),
  create: (password: string, tier: KdfTier): Promise<number> => send({ op: 'create', password, tier }),
  unlock: (password: string): Promise<number> => send({ op: 'unlock', password }),
  lock: (): Promise<void> => send({ op: 'lock' }),
  listCodes: (): Promise<EntryView[]> => send({ op: 'codes' }),
  /** 只回 id：条目记录里带种子，绝不让它离开 offscreen */
  add: (input: NewEntryInput): Promise<{ id: string }> => send({ op: 'add', input }),
  remove: (id: string): Promise<void> => send({ op: 'remove', id }),
  togglePin: (id: string): Promise<boolean> => send({ op: 'pin', id }),
  bumpCounter: (id: string): Promise<number> => send({ op: 'bump', id }),
  exportBackup: (): Promise<string> => send({ op: 'export' }),
  importBackup: (text: string, password: string): Promise<{ imported: number; skipped: number }> =>
    send({ op: 'import', text, password }),
  changePassword: (oldPassword: string, newPassword: string, tier?: KdfTier): Promise<void> =>
    send({ op: 'rewrap', oldPassword, newPassword, tier }),
  getSettings: (): Promise<Settings> => send<VaultStatus>({ op: 'status' }).then((status) => status.settings),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => send({ op: 'setSettings', patch }),
  selfTest: (): Promise<SelfTestReport> => send({ op: 'selftest' }),
};

export type VaultClient = typeof vaultService;
