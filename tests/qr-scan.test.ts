import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseImportText } from '../lib/importers';
import { dataUrlToBytes, decodeQrFromBytes, pickOtpText } from '../lib/qr-scan';

/** 走本地文件，避免 zxing-wasm 默认去 CDN 拉 wasm —— 测试环境也不该联网 */
const WASM = new Uint8Array(readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
const FIXTURE = new Uint8Array(readFileSync('tests/fixtures/github-qr.png'));
const EXPECTED = 'otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';

describe('二维码识别', () => {
  it('读得出 GitHub 的配置二维码', async () => {
    const texts = await decodeQrFromBytes(FIXTURE, { wasmBinary: WASM });
    expect(texts).toContain(EXPECTED);
  });

  it('识别结果能直接进导入流程', async () => {
    const texts = await decodeQrFromBytes(FIXTURE, { wasmBinary: WASM });
    const parsed = parseImportText(pickOtpText(texts) ?? '');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.issuer).toBe('GitHub');
    expect(parsed.entries[0]!.secret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('没有二维码的图片返回空数组而不是报错', async () => {
    const png = await makeBlankPng();
    expect(await decodeQrFromBytes(png, { wasmBinary: WASM })).toEqual([]);
  });

  it('从识别结果里只挑验证码配置', () => {
    expect(pickOtpText(['https://example.com', 'otpauth-migration://offline?data=AA'])).toBe(
      'otpauth-migration://offline?data=AA',
    );
    expect(pickOtpText(['WIFI:S:home;P:1234;;'])).toBeNull();
  });

  it('截图 data URL 能还原成字节', () => {
    const bytes = dataUrlToBytes('data:image/png;base64,AAECAw==');
    expect([...bytes]).toEqual([0, 1, 2, 3]);
    expect(() => dataUrlToBytes('broken')).toThrow(/格式异常/);
  });
});

/** 1×1 的透明 PNG，用来验证「图里没有码」的分支 */
async function makeBlankPng(): Promise<Uint8Array> {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
