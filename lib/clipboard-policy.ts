/**
 * 清空剪贴板的前置判断，独立成文件是为了脱离浏览器 API 单测。
 * 两个条件缺一不可：用户选了延时、clipboardWrite 权限在手。
 */
export function shouldScheduleClear(ms: number, granted: boolean): boolean {
  return granted && Number.isFinite(ms) && ms > 0;
}
