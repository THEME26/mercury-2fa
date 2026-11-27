/**
 * 生成商店素材：扩展图标、商店 Logo、1280×800 截图。
 * 源图为 docs/live/*.png（真实扩展 2 倍图，由 .probe/shots.mjs 截取）。
 * 运行：npm run assets
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const ICON_DIR = join(ROOT, 'public', 'icon');
const LIVE_DIR = join(ROOT, 'docs', 'live');
const STORE_DIR = join(ROOT, 'docs', 'store');

const FONT = "Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, sans-serif";

/** 计时环图标：蓝底圆角方块 + 白色缺口环（缺口在正上方）+ 中心点 */
function iconSvg(size) {
  const s = size;
  const r = 0.28 * s;
  const cx = 0.5 * s;
  const cy = 0.5 * s;
  const a0 = (-60 * Math.PI) / 180;
  const a1 = (240 * Math.PI) / 180;
  const x0 = (cx + r * Math.cos(a0)).toFixed(3);
  const y0 = (cy + r * Math.sin(a0)).toFixed(3);
  const x1 = (cx + r * Math.cos(a1)).toFixed(3);
  const y1 = (cy + r * Math.sin(a1)).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${0.22 * s}" fill="url(#g)"/>
  <path d="M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}"
        fill="none" stroke="#ffffff" stroke-width="${0.1 * s}" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="${0.06 * s}" fill="#ffffff"/>
</svg>`;
}

/**
 * 按像素预算折行。字宽按平均系数估算，右侧留了余量吸收误差；
 * 单个词就超预算时按字符硬切，中文长句也能断开。
 */
function wrap(text, size, factor, budget) {
  const fits = (s) => s.length * size * factor <= budget;
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    if (fits(word)) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const ch of word) {
      if (!fits(chunk + ch)) {
        out.push(chunk);
        chunk = '';
      }
      chunk += ch;
    }
    line = chunk;
  }
  if (line) out.push(line);
  return out;
}

/** 截图版式：左侧文案，右侧弹窗卡片 */
function shotSvg({ title, lines, image, imageW, imageH, footer, faded = false }) {
  const W = 1280;
  const H = 800;
  const cardPad = 10;
  const cardW = imageW + cardPad * 2;
  const cardH = imageH + cardPad * 2;
  const cardX = W - cardW - 120;
  const cardY = cardH < 620 ? Math.round((H - cardH) / 2) : H - cardH - 36;

  const textX = 96;
  // 文案栏右侧要留出与卡片的安全距离，长句子按这个宽度折
  const budget = cardX - textX - 48;

  // 标题放不下就降一档字号，最多三行
  let titleSize = 62;
  let titleLines = [];
  for (const size of [62, 54, 46]) {
    titleSize = size;
    titleLines = title.flatMap((line) => wrap(line, size, 0.58, budget));
    if (titleLines.length <= 3) break;
  }
  const titleStep = Math.round(titleSize * 1.19);
  const titleY = 300;

  const bodyStart = titleY + (titleLines.length - 1) * titleStep + 62;
  const bodyLines = lines.flatMap((line) => wrap(line, 24, 0.53, budget));

  const footerLines = wrap(footer, 18, 0.52, budget);
  const footerBase = H - 64;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#e8eef8"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
    <clipPath id="rounded">
      <rect x="${cardX + cardPad}" y="${cardY + cardPad}" width="${imageW}" height="${imageH}" rx="12"/>
    </clipPath>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="6" height="${H}" fill="url(#bar)"/>

  <g font-family="${FONT}">
    <text x="${textX}" y="176" font-size="26" fill="#2563eb" font-weight="600">Mercury 2FA</text>
    ${titleLines
      .map(
        (line, i) =>
          `<text x="${textX}" y="${titleY + i * titleStep}" font-size="${titleSize}" fill="#0f172a" font-weight="700">${line}</text>`,
      )
      .join('\n    ')}
    ${bodyLines
      .map(
        (line, i) =>
          `<text x="${textX}" y="${bodyStart + i * 40}" font-size="24" fill="#475569">${line}</text>`,
      )
      .join('\n    ')}
  </g>

  <rect x="${cardX + 6}" y="${cardY + 12}" width="${cardW}" height="${cardH}" rx="14" fill="#0f172a" opacity="0.10"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="#ffffff" stroke="#dbe2ec"/>
  <image href="data:image/png;base64,${image}" x="${cardX + cardPad}" y="${cardY + cardPad}"
         width="${imageW}" height="${imageH}" clip-path="url(#rounded)"/>
  ${
    faded
      ? `<rect x="${cardX + cardPad}" y="${cardY + cardPad + imageH - 72}" width="${imageW}" height="72"
         fill="url(#fade)" clip-path="url(#rounded)"/>`
      : ''
  }

  ${footerLines
    .map(
      (line, i) =>
        `<text x="${textX}" y="${footerBase - (footerLines.length - 1 - i) * 26}" font-family="${FONT}" font-size="18" fill="#94a3b8">${line}</text>`,
    )
    .join('\n  ')}
</svg>`;
}

const SHOTS = [
  {
    src: 'list.png',
    out: 'shot-1-codes',
    en: {
      title: ['Every code', 'on one screen'],
      lines: ['Countdown turns red in the last 5 s', 'Click to copy, or fill the login form'],
      footer: 'Offline · no site permissions · keys stay local',
    },
    zh: {
      title: ['全部验证码', '一屏之内'],
      lines: ['倒计时进度条，剩余 5 秒转红', '点一下复制，或直接填入当前登录页'],
      footer: '离线运行 · 零站点权限 · 密钥不进界面进程',
    },
  },
  {
    src: 'import.png',
    out: 'shot-2-import',
    en: {
      title: ['Scan the code', 'from the page'],
      lines: ['Decoded inside the extension', 'The image never leaves this machine'],
      footer: 'otpauth links and exports from major authenticators',
    },
    zh: {
      title: ['扫码导入', '本地解码'],
      lines: ['截取当前页面，在扩展内识别二维码', '图像不出本机，不联网'],
      footer: '支持 otpauth 链接与主流验证器导出',
    },
  },
  {
    src: 'settings.png',
    out: 'shot-3-settings',
    en: {
      title: ['Locks on idle', 'and encrypts'],
      lines: ['The idle timer drops the key', 'Restore checks the entry count'],
      footer: 'Argon2id · AES-GCM-256 · no vault rewrite',
    },
    zh: {
      title: ['自动锁定', '加密备份'],
      lines: ['空闲即丢弃解密密钥', '备份文件是密文，恢复时核对条数'],
      footer: 'Argon2id 派生 · AES-GCM-256 · 更换主密码不重写库体',
    },
  },
  {
    src: 'lock.png',
    out: 'shot-4-lock',
    en: {
      title: ['Seeds stay in', 'memory only'],
      lines: ['Argon2id + AES-GCM-256', 'Decryption runs in a separate page'],
      footer: 'The backup is the only way back',
    },
    zh: {
      title: ['种子只在', '本机内存'],
      lines: ['Argon2id 派生 + AES-GCM-256', '解密在独立后台页面完成'],
      footer: '主密码不可找回，备份是唯一退路',
    },
  },
];

/** SVG 里的文本节点要转义，否则 `&`、`<` 会让整张图解析失败 */
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  await mkdir(ICON_DIR, { recursive: true });
  await mkdir(STORE_DIR, { recursive: true });

  for (const size of [16, 32, 48, 128]) {
    await sharp(Buffer.from(iconSvg(size))).png().toFile(join(ICON_DIR, `${size}.png`));
  }
  await sharp(Buffer.from(iconSvg(300))).png().toFile(join(STORE_DIR, 'logo-300.png'));
  await sharp(Buffer.from(iconSvg(440)))
    .resize(440, 280, { fit: 'contain', background: '#f8fafc' })
    .png()
    .toFile(join(STORE_DIR, 'promo-440x280.png'));

  // 英文版是主图，中文版加 `.zh-CN` 后缀，供中文商店页面单独上传。
  // 截图的界面语言要跟着文案走，所以中文版读 docs/live/zh-CN/ 那一套。
  for (const shot of SHOTS) {
    for (const [lang, text] of Object.entries({ en: shot.en, 'zh-CN': shot.zh })) {
      const dir = lang === 'en' ? LIVE_DIR : join(LIVE_DIR, lang);
      const buf = await readFile(join(dir, shot.src));
      const meta = await sharp(buf).metadata();
      // 卡片最高 700：能整张放下就缩一点宽度，放不下才裁（长设置页就是裁的）
      const MAX_H = 700;
      let imageW = 520;
      for (const candidate of [520, 500, 480, 460, 440, 420]) {
        if (Math.round((meta.height * candidate) / meta.width) <= MAX_H) {
          imageW = candidate;
          break;
        }
      }
      const fullH = Math.round((meta.height * imageW) / meta.width);
      const imageH = Math.min(fullH, MAX_H);
      const img = await sharp(buf)
        .resize(imageW, fullH, { kernel: 'lanczos3' })
        .extract({ left: 0, top: 0, width: imageW, height: imageH })
        .png()
        .toBuffer();
      const svg = shotSvg({
        ...text,
        title: text.title.map(esc),
        lines: text.lines.map(esc),
        footer: esc(text.footer),
        image: img.toString('base64'),
        imageW,
        imageH,
        faded: imageH < fullH,
      });
      const name = lang === 'en' ? `${shot.out}.png` : `${shot.out}.${lang}.png`;
      await sharp(Buffer.from(svg)).png().toFile(join(STORE_DIR, name));
      console.log(name, `${imageW}x${imageH}（源 ${meta.width}x${meta.height}）-> 1280x800`);
    }
  }

  // README 内嵌图同步成干净版本，中文 README 用带 `.zh-CN` 的那一套
  const mirrors = [
    ['list.png', 'list.png'],
    ['import.png', 'scan.png'],
    ['settings.png', 'settings.png'],
    ['lock.png', 'lock.png'],
  ];
  for (const [from, to] of mirrors) {
    await writeFile(join(ROOT, 'docs', to), await readFile(join(LIVE_DIR, from)));
    const zhName = to.replace(/\.png$/, '.zh-CN.png');
    await writeFile(join(ROOT, 'docs', zhName), await readFile(join(LIVE_DIR, 'zh-CN', from)));
  }
  console.log('docs/*.png 已同步（含 zh-CN）');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
