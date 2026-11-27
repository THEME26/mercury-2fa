import { describe, expect, it } from 'vitest';
import { shouldScheduleClear } from '../lib/clipboard-policy';

describe('清空剪贴板的前置条件', () => {
  it('权限在手且选了延时才排清空', () => {
    expect(shouldScheduleClear(30_000, true)).toBe(true);
    expect(shouldScheduleClear(120_000, true)).toBe(true);
  });

  it('没有权限就不排，即使设置里还留着旧延时', () => {
    expect(shouldScheduleClear(30_000, false)).toBe(false);
    expect(shouldScheduleClear(120_000, false)).toBe(false);
  });

  it('选了不清空就不排，权限有没有都一样', () => {
    expect(shouldScheduleClear(0, true)).toBe(false);
    expect(shouldScheduleClear(0, false)).toBe(false);
    expect(shouldScheduleClear(-1, true)).toBe(false);
  });

  it('非有限值不排', () => {
    expect(shouldScheduleClear(Number.NaN, true)).toBe(false);
    expect(shouldScheduleClear(Number.POSITIVE_INFINITY, true)).toBe(false);
  });
});
