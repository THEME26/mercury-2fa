import { browser } from 'wxt/browser';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * 二维码识别。zxing-wasm 默认的 locateFile 会去 jsdelivr 拉 wasm —— 那是远程代码，
 * MV3 明确禁止，也和「零网络请求」直接冲突。这里换成打包进扩展的那份文件。
 */

/** 测试注入用：直接给 wasm 字节，跳过分块加载 */
export interface ScanOverrides {
  wasmBinary?: Uint8Array;
}

type ReaderModule = typeof import('zxing-wasm/reader');

let loading: Promise<ReaderModule> | null = null;

function assetUrl(): string {
  return new URL(wasmUrl, location.href).href;
}

async function loadReader(overrides?: ScanOverrides): Promise<ReaderModule> {
  const module = await import('zxing-wasm/reader');
  if (overrides?.wasmBinary) {
    await module.prepareZXingModule({ overrides: { wasmBinary: overrides.wasmBinary }, fireImmediately: true });
    return module;
  }
  if (loading === null) {
    loading = module
      .prepareZXingModule({ overrides: { locateFile: assetUrl }, fireImmediately: true })
      .then(() => module);
  }
  await loading;
  return module;
}

/** 从图片字节里读出所有二维码文本，按识别顺序返回 */
export async function decodeQrFromBytes(bytes: Uint8Array, overrides?: ScanOverrides): Promise<string[]> {
  const { readBarcodes } = await loadReader(overrides);
  const results = await readBarcodes(bytes, { formats: ['QRCode'], tryHarder: true });
  return results
    .filter((result) => result.isValid && typeof result.text === 'string' && result.text !== '')
    .map((result) => result.text);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('截图数据格式异常');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 截当前标签页再识别。需要 activeTab，用户点按钮那一刻才拿到授权 */
export async function scanActiveTab(overrides?: ScanOverrides): Promise<string[]> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== 'number') throw new Error('读不到当前标签页');
  if (typeof tab.url === 'string' && !/^https?:\/\//i.test(tab.url)) {
    throw new Error('浏览器内部页面不给截图，请在普通网页上使用');
  }

  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  if (typeof dataUrl !== 'string') throw new Error('截图失败');
  return decodeQrFromBytes(dataUrlToBytes(dataUrl), overrides);
}

/** 从识别结果里挑出能导入的那些 */
export function pickOtpText(texts: string[]): string | null {
  const hit = texts.find(
    (text) => text.startsWith('otpauth://') || text.startsWith('otpauth-migration://'),
  );
  return hit ?? null;
}
