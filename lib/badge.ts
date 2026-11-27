/** 备份健康度：条数大于零且最近 30 天没有导出时，图标挂一个 `!` */
export const BACKUP_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 纯函数，便于单测。从未导出（lastBackupAt 未定义）与超出窗口都算过期；
 * 空库不提醒，避免刚建库就挂角标。
 */
export function backupBadgeText(
  entryCount: number,
  lastBackupAt: number | undefined,
  now: number,
): '' | '!' {
  if (!Number.isFinite(entryCount) || entryCount <= 0) return '';
  if (typeof lastBackupAt !== 'number' || !Number.isFinite(lastBackupAt)) return '!';
  return now - lastBackupAt > BACKUP_STALE_MS ? '!' : '';
}
