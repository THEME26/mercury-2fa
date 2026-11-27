/**
 * 用真实构建产物截取商店用原始截图，避免把预览脚本的调试输出带进图里。
 * 产物：docs/live/{list,import,settings,lock}.png（2 倍图）
 */
import { spawn } from 'node:child_process';
import { rm, mkdir, writeFile } from 'node:fs/promises';

const BIN = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EXT = 'D:/2FA_THEME26/.output/edge-mv3';
const PROFILE = `D:/2FA_THEME26/.probe/shot-profile-${Date.now()}`;
const OUT = 'D:/2FA_THEME26/docs/live';
const PORT = 9281 + (Date.now() % 20);
const ID = 'phaaiimkjbieajjhclcdmbofgnmfhech';
const PASSWORD = 'store-demo-2026';

const ENTRIES = [
  'otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
  'otpauth://totp/AWS:ops@acme.dev?secret=KRSXG5CTMVRXEZLU&issuer=AWS',
  'otpauth://totp/Cloudflare:ops@example.com?secret=MFRGGZDFMZTWQ2LK&issuer=Cloudflare&algorithm=SHA256&digits=8&period=60',
];

await rm(PROFILE, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const child = spawn(
  BIN,
  [
    `--user-data-dir=${PROFILE}`,
    `--load-extension=${EXT}`,
    `--disable-extensions-except=${EXT}`,
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let version = null;
for (let i = 0; i < 100; i++) {
  try {
    version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    if (version.webSocketDebuggerUrl) break;
  } catch {}
  await sleep(200);
}

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => pending.has(id) && (pending.delete(id), resolve({ error: 'timeout ' + method })), 9000);
  });

const created = await send('Target.createTarget', { url: `chrome-extension://${ID}/popup.html` });
if (!created.result?.targetId) throw new Error('createTarget failed: ' + JSON.stringify(created).slice(0, 200));
const attached = await send('Target.attachToTarget', { targetId: created.result.targetId, flatten: true });
const sid = attached.result?.sessionId;
if (!sid) throw new Error('attach failed: ' + JSON.stringify(attached).slice(0, 200));
await send('Runtime.enable', {}, sid);
await send('Page.enable', {}, sid);
await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 2, mobile: false }, sid);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sid);
  if (r.result?.exceptionDetails) return 'EXC ' + (r.result.exceptionDetails.exception?.description ?? '').split('\n')[0];
  return r.result?.result?.value;
};
const text = () => evaluate('document.body.innerText.replace(/\\n+/g, " / ")');

const clickByText = (pattern) =>
  evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => new RegExp(${JSON.stringify(pattern)}).test((b.textContent ?? '').trim()));
    if (!button) return 'no-button';
    button.click();
    return 'clicked';
  })()`);

const fillInput = (index, value, selector = 'input') =>
  evaluate(`(() => {
    const list = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const input = list[${index}];
    if (!input) return 'no-input';
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()`);

async function shoot(name) {
  // body 实际尺寸：先问文档，取不到再退回布局信息
  const raw = await evaluate(
    'JSON.stringify({ w: Math.round(document.body.getBoundingClientRect().width), h: Math.round(document.body.getBoundingClientRect().height) })',
  );
  let w = 360;
  let h = 800;
  try {
    const parsed = JSON.parse(raw);
    w = Math.min(380, parsed.w || 360);
    h = parsed.h || 800;
  } catch {
    const metrics = await send('Page.getLayoutMetrics', {}, sid);
    const size = metrics.result?.cssContentSize ?? { width: 360, height: 800 };
    w = Math.min(380, Math.ceil(size.width));
    h = Math.ceil(size.height);
  }
  const shot = await send(
    'Page.captureScreenshot',
    { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 2 }, captureBeyondViewport: true },
    sid,
  );
  if (!shot.result?.data) throw new Error('screenshot failed: ' + JSON.stringify(shot).slice(0, 200));
  await writeFile(`${OUT}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`  ${name}.png ${w}x${h} @2x`);
}

await sleep(1600);

// 1 建库
await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('input[type=password]')];
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  inputs.forEach((i) => { setter.call(i, ${JSON.stringify(PASSWORD)}); i.dispatchEvent(new Event('input', { bubbles: true })); });
  [...document.querySelectorAll('button')].find((b) => /创建保险库/.test(b.textContent ?? ''))?.click();
})()`);
await sleep(4000);
console.log('建库后:', await text());

// 2 逐条添加
for (const uri of ENTRIES) {
  await clickByText('^\\+$|＋');
  await sleep(500);
  await fillInput(0, uri);
  await sleep(300);
  await clickByText('^保存$');
  await sleep(2200);
}
console.log('添加后:', await text());
// 等到新周期开始再截，避免三个码都落在「剩余 5 秒」的红色状态
const remain = 30000 - (Date.now() % 30000);
if (remain < 16000) await sleep(remain + 400);
await sleep(900);
await shoot('list');

// 3 导入面板
await clickByText('^导入$');
await sleep(700);
await fillInput(0, ENTRIES[2], 'textarea');
await sleep(300);
await clickByText('^解析$');
await sleep(900);
console.log('导入预览:', await text());
await shoot('import');
await clickByText('^返回$|^取消$');
await sleep(700);

// 4 设置
console.log('返回后:', await text());
await clickByText('^设置$');
await sleep(1000);
console.log('设置页:', await text());
await shoot('settings');
await clickByText('^返回$|^完成$|^关闭$');
await sleep(700);

// 5 锁定
await clickByText('立即锁定');
await sleep(1200);
console.log('锁定后:', await text());
await shoot('lock');

child.kill();
process.exit(0);
