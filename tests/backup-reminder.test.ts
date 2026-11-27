import { describe, expect, it } from 'vitest';
import { BACKUP_STALE_MS, backupReminder } from '../lib/backup-reminder';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('备份提醒判定', () => {
  it('空库不提醒', () => {
    expect(backupReminder(0, undefined, NOW)).toBe('fresh');
    expect(backupReminder(0, NOW - 60 * DAY, NOW)).toBe('fresh');
  });

  it('有条目且从未导出', () => {
    expect(backupReminder(3, undefined, NOW)).toBe('never');
  });

  it('导出未满 30 天算正常', () => {
    expect(backupReminder(3, NOW - 29 * DAY, NOW)).toBe('fresh');
  });

  it('正好 30 天仍算正常，超过才提醒', () => {
    expect(backupReminder(3, NOW - BACKUP_STALE_MS, NOW)).toBe('fresh');
    expect(backupReminder(3, NOW - BACKUP_STALE_MS - 1000, NOW)).toBe('stale');
  });

  it('导出时间是脏数据时按从未导出处理', () => {
    expect(backupReminder(3, Number.NaN, NOW)).toBe('never');
  });
});
