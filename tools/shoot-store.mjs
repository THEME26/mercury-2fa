/**
 * 用真实构建产物截取商店用原始截图，避免把预览脚本的调试输出带进图里。
 *
 * 用法：npm run shots          （英文，写到 docs/live/）
 *      npm run shots -- zh-CN  （其他语言，写到 docs/live/<locale>/）
 *
 * 产物：{list,import,settings,lock}.png，4 倍图（宽 1440）。
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const LOCALE = process.argv[2] ?? 'en';

/** 界面语言决定按钮文案，截图脚本按这张表点 */
const LABELS = {
  en: {
    create: '^Create vault$',
    import: '^Import$',
    parse: '^Parse$',
    apply: '^Import 3$',
    settings: '^Settings$',
    export: '^Export backup file$',
    back: '^Back$',
    lock: '^Lock now$',
  },
  'zh-CN': {
    create: '^创建保险库$',
    import: '^导入$',
    parse: '^解析$',
    apply: '^导入 3 条$',
    settings: '^设置$',
    export: '^导出备份文件$',
    back: '^返回$',
    lock: '^立即锁定$',
  },
}[LOCALE];
if (!LABELS) throw new Error(`没有 ${LOCALE} 的按钮文案，先补进 LABELS`);

const BIN = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EXT = 'D:/2FA_THEME26/.output/edge-mv3';
const PROFILE = `D:/2FA_THEME26/.probe/shot-profile-${LOCALE}-${Date.now()}`;
const OUT = LOCALE === 'en' ? 'D:/2FA_THEME26/docs/live' : `D:/2FA_THEME26/docs/live/${LOCALE}`;
const PORT = 9281 + (Date.now() % 20);
const ID = 'phaaiimkjbieajjhclcdmbofgnmfhech';
const PASSWORD = 'store-demo-2026';
const WIDTH = 360;
const SCALE = 4;

const ENTRIES = [
  'otpauth://totp/AWS:ops%40acme.dev?secret=JBSWY3DPEHPK3PXP&issuer=AWS',
  'otpauth://totp/Cloudflare:ops%40example.com?secret=MFRGGZDFMZTWQ2LK&issuer=Cloudflare&algorithm=SHA256&digits=8&period=60',
  'otpauth://totp/GitHub:alice%40example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub',
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
    `--lang=${LOCALE}`,
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
if (!version?.webSocketDebuggerUrl) {
  child.kill();
  throw new Error('浏览器没起来');
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
    setTimeout(() => pending.has(id) && (pending.delete(id), resolve({ error: 'timeout ' + method })), 15000);
  });

const created = await send('Target.createTarget', { url: `chrome-extension://${ID}/popup.html` });
if (!created.result?.targetId) throw new Error('createTarget failed: ' + JSON.stringify(created).slice(0, 200));
const attached = await send('Target.attachToTarget', { targetId: created.result.targetId, flatten: true });
const sid = attached.result?.sessionId;
if (!sid) throw new Error('attach failed: ' + JSON.stringify(attached).slice(0, 200));

const metrics = (height) =>
  send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height, deviceScaleFactor: SCALE, mobile: false }, sid);

await send('Runtime.enable', {}, sid);
await send('Page.enable', {}, sid);
await metrics(900);

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
    const input = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
    if (!input) return 'no-input';
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()`);

/** 视口拉到内容高度再截，避免滚动条和底部空白 */
async function shoot(name) {
  const height = await evaluate('Math.ceil(document.body.getBoundingClientRect().height)');
  if (typeof height !== 'number') throw new Error('量不到高度: ' + height);
  await metrics(height);
  await sleep(260);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sid);
  if (!shot.result?.data) throw new Error('screenshot failed: ' + JSON.stringify(shot).slice(0, 200));
  await writeFile(`${OUT}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`  ${name}.png ${WIDTH * SCALE}x${height * SCALE}`);
}

await sleep(1600);

// 语言偏好存在保险库之外，先写进去再重载，之后所有按钮文案都跟着变
if (LOCALE !== 'en') {
  await evaluate(
    `new Promise((r) => chrome.storage.local.set({ 'ui.language': ${JSON.stringify(LOCALE)} }, r)).then(() => 'ok')`,
  );
  await send('Page.reload', {}, sid);
  await sleep(1800);
  await send('Runtime.enable', {}, sid);
  await metrics(900);
}
console.log('界面语言:', await evaluate('document.documentElement.lang'));

// 1 建库
await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('input[type=password]')];
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  inputs.forEach((i) => { setter.call(i, ${JSON.stringify(PASSWORD)}); i.dispatchEvent(new Event('input', { bubbles: true })); });
})()`);
await sleep(300);
console.log('建库:', await clickByText(LABELS.create));
await sleep(4000);

// 2 一次性导入三条
console.log('进导入:', await clickByText(LABELS.import));
await sleep(700);
await fillInput(0, ENTRIES.join('\n'), 'textarea');
await sleep(300);
console.log('解析:', await clickByText(LABELS.parse));
await sleep(900);
console.log('导入预览:', await text());
await shoot('import');
console.log('应用:', await clickByText(LABELS.apply));
// 等提示条自己消失，否则会盖住底部一行
await sleep(3200);

// 等到新周期开始再截，避免三个码都落在「剩余 5 秒」的红色状态
const remain = 30000 - (Date.now() % 30000);
if (remain < 16000) await sleep(remain + 400);
await sleep(900);
await shoot('list');

// 3 设置（先导出一次，截出来的备份状态是健康的，不出现「从未导出」警示）
console.log('进设置:', await clickByText(LABELS.settings));
await sleep(1000);
console.log('导出备份:', await clickByText(LABELS.export));
await sleep(1400);
console.log('设置页:', await text());
await shoot('settings');

// 4 锁定
console.log('返回:', await clickByText(LABELS.back));
await sleep(700);
console.log('锁定:', await clickByText(LABELS.lock));
await sleep(1400);
console.log('锁定后:', await text());
await shoot('lock');

child.kill();
process.exit(0);
