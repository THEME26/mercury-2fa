/** 站点与发行方的匹配。用于 popup 打开时猜哪条条目属于当前页面。 */

const CORPORATE_SUFFIXES = [
  'incorporated',
  'corporation',
  'company',
  'limited',
  'gmbh',
  'sarl',
  'srl',
  'inc',
  'ltd',
  'llc',
  'corp',
  'co',
  'sa',
  'ag',
  'bv',
  'plc',
  'pte',
];

/** 手写常用二级后缀，避免为 eTLD+1 引入完整 public suffix list */
const SECOND_LEVEL = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'co.jp',
  'ne.jp',
  'or.jp',
  'co.kr',
  'or.kr',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'com.tw',
  'com.hk',
  'com.sg',
  'com.au',
  'net.au',
  'com.br',
  'com.mx',
  'co.in',
  'co.nz',
  'co.za',
  'com.tr',
]);

/** 去掉标点与公司后缀，只留字母数字 */
export function normalizeIssuer(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return '';
  const tokens = cleaned.split(' ').filter((token) => token !== '' && CORPORATE_SUFFIXES.indexOf(token) < 0);
  return tokens.join('');
}

/** issuer 拆成词，用于和子域名逐词比对 */
export function issuerTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5 ]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && CORPORATE_SUFFIXES.indexOf(token) < 0);
}

/** 取注册域，近似 eTLD+1 */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.').filter((part) => part !== '');
  if (parts.length <= 2) return parts.join('.');
  const tail = parts.slice(-2).join('.');
  if (SECOND_LEVEL.has(tail)) return parts.slice(-3).join('.');
  return tail;
}

/** 主要标签：github.com → github，accounts.google.co.uk → google */
export function domainLabel(host: string): string {
  const domain = registrableDomain(host);
  const parts = domain.split('.');
  return parts[0] ?? '';
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] ?? 0;
}

/**
 * 打分规则，取最高分：
 * 100 注册域主标签与归一化 issuer 相等
 * 80  issuer 某个词等于主标签，或等于 host 的任一子域标签
 * 70  归一化 issuer 与标签互相包含（长度 ≥ 4）
 * 50  编辑距离 ≤ 2（长度 ≥ 5）
 */
export function scoreEntry(host: string, issuer: string): number {
  const label = domainLabel(host);
  const normalized = normalizeIssuer(issuer);
  if (label === '' || normalized === '') return 0;

  if (label === normalized) return 100;

  const tokens = issuerTokens(issuer);
  const labels = host.toLowerCase().split('.').filter((part) => part !== '');
  for (const token of labels) {
    if (tokens.indexOf(token) >= 0) return 80;
  }

  if (normalized.length >= 4 && label.length >= 4) {
    if (label.indexOf(normalized) >= 0 || normalized.indexOf(label) >= 0) return 70;
  }

  if (label.length >= 5 && normalized.length >= 5 && editDistance(label, normalized) <= 2) return 50;

  return 0;
}

export interface SiteCandidate {
  issuer: string;
}

/** 返回当前站点最可能的条目；无匹配返回 null */
export function bestMatch<T extends SiteCandidate>(host: string, entries: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = scoreEntry(host, entry.issuer);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 70 ? best : null;
}
