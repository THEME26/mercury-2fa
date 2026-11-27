import { describe, expect, it } from 'vitest';
import { BACKUP_STALE_MS, backupBadgeText } from '../lib/badge';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('备份角标判定', () => {
  it('空库不挂角标', () => {
    expect(backupBadgeText(0, undefined, NOW)).toBe('');
    expect(backupBadgeText(0, NOW - 60 * DAY, NOW)).toBe('');
  });

  it('有条目且从未导出时挂角标', () => {
    expect(backupBadgeText(3, undefined, NOW)).toBe('!');
  });

  it('导出未满 30 天不挂角标', () => {
    expect(backupBadgeText(3, NOW - 29 * DAY, NOW)).toBe('');
  });

  it('正好 30 天仍不挂，超过才挂', () => {
    expect(backupBadgeText(3, NOW - BACKUP_STALE_MS, NOW)).toBe('');
    expect(backupBadgeText(3, NOW - BACKUP_STALE_MS - 1000, NOW)).toBe('!');
  });

  it('导出时间是脏数据时按从未导出处理', () => {
    expect(backupBadgeText(3, Number.NaN, NOW)).toBe('!');
  });
});
