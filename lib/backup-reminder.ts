/** 设置页的备份提醒：条数大于零且最近 30 天没有导出时给一句警示 */
export const BACKUP_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export type BackupReminder = 'fresh' | 'never' | 'stale';

/**
 * 纯函数，便于单测。空库不提醒，避免刚建库就报警。
 * never 与 stale 分开返回，是为了在设置页给出不同的句子：
 * 前者还没有退路，后者只是备份旧了。
 */
export function backupReminder(
  entryCount: number,
  lastBackupAt: number | undefined,
  now: number,
): BackupReminder {
  if (!Number.isFinite(entryCount) || entryCount <= 0) return 'fresh';
  if (typeof lastBackupAt !== 'number' || !Number.isFinite(lastBackupAt)) return 'never';
  return now - lastBackupAt > BACKUP_STALE_MS ? 'stale' : 'fresh';
}
