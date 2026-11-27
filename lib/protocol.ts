/**
 * popup 与 service worker、service worker 与 offscreen 之间唯一的通信契约。
 *
 * 规则只有三条：
 * 1. 命令名必须在白名单里，其余一律丢弃
 * 2. 转发时按字段白名单重建对象，不透传原始消息
 * 3. 返回值不允许出现任何名字叫 secret 的字段
 */
import type { KdfTier, NewEntryInput, Settings } from './types';

export type VaultOp =
  | 'ping'
  | 'status'
  | 'create'
  | 'unlock'
  | 'lock'
  | 'codes'
  | 'add'
  | 'remove'
  | 'pin'
  | 'bump'
  | 'export'
  | 'import'
  | 'rewrap'
  | 'setSettings'
  | 'selftest'
  | 'clipboardClear';

const OPS: readonly VaultOp[] = [
  'ping',
  'status',
  'create',
  'unlock',
  'lock',
  'codes',
  'add',
  'remove',
  'pin',
  'bump',
  'export',
  'import',
  'rewrap',
  'setSettings',
  'selftest',
  'clipboardClear',
];

export type VaultCommand =
  | { op: 'ping' }
  | { op: 'status' }
  | { op: 'create'; password: string; tier: KdfTier }
  | { op: 'unlock'; password: string }
  | { op: 'lock' }
  | { op: 'codes' }
  | { op: 'add'; input: NewEntryInput }
  | { op: 'remove'; id: string }
  | { op: 'pin'; id: string }
  | { op: 'bump'; id: string }
  | { op: 'export' }
  | { op: 'import'; text: string; password: string }
  | { op: 'rewrap'; oldPassword: string; newPassword: string; tier?: KdfTier }
  | { op: 'setSettings'; patch: Partial<Settings> }
  | { op: 'selftest' }
  | { op: 'clipboardClear' };

/** offscreen 只接受这两个 target，popup 只能发 vault */
export type Target = 'vault' | 'offscreen';

export interface VaultErrorShape {
  message: string;
  code?: string;
}

export type VaultReply<T = unknown> = { ok: true; data: T } | { ok: false; error: VaultErrorShape };

/** 导入文本的硬上限，防止一条消息把 offscreen 内存撑爆 */
export const MAX_IMPORT_CHARS = 2_000_000;
export const MAX_PASSWORD_CHARS = 512;

function str(value: unknown, limit = MAX_PASSWORD_CHARS): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= limit ? value : null;
}

function id(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null;
}

function tier(value: unknown): KdfTier | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function settingsPatch(value: unknown): Partial<Settings> | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const patch: Partial<Settings> = {};
  if (typeof raw.lockAfterMs === 'number' && Number.isFinite(raw.lockAfterMs)) {
    patch.lockAfterMs = raw.lockAfterMs;
  }
  if (typeof raw.clipboardClearMs === 'number' && Number.isFinite(raw.clipboardClearMs)) {
    patch.clipboardClearMs = raw.clipboardClearMs;
  }
  if (tier(raw.kdfTier)) patch.kdfTier = raw.kdfTier as KdfTier;
  return patch;
}

function entryInput(value: unknown): NewEntryInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.uri === 'string' && raw.uri.length <= 4096) return { uri: raw.uri };

  const manual = raw.manual;
  if (typeof manual !== 'object' || manual === null) return null;
  const m = manual as Record<string, unknown>;
  const type = m.type;
  if (type !== 'totp' && type !== 'hotp' && type !== 'steam') return null;
  const secret = str(m.secret, 512);
  if (secret === null) return null;
  const algorithm = m.algorithm;
  return {
    manual: {
      type,
      issuer: typeof m.issuer === 'string' ? m.issuer.slice(0, 200) : '',
      account: typeof m.account === 'string' ? m.account.slice(0, 200) : '',
      secret,
      algorithm:
        algorithm === 'SHA-1' || algorithm === 'SHA-256' || algorithm === 'SHA-512' ? algorithm : undefined,
      digits: typeof m.digits === 'number' ? m.digits : undefined,
      period: typeof m.period === 'number' ? m.period : undefined,
      counter: typeof m.counter === 'number' ? m.counter : undefined,
    },
  };
}

/**
 * 把任意输入折成白名单命令。返回 null 表示这条消息不该被处理。
 * 所有字段都重新构造，原始对象上的多余键不会进入下游。
 */
export function normalizeCommand(raw: unknown, expected: Target): VaultCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const message = raw as Record<string, unknown>;
  if (message.target !== expected) return null;

  const op = message.op;
  if (typeof op !== 'string' || !OPS.includes(op as VaultOp)) return null;

  switch (op as VaultOp) {
    case 'ping':
      return { op: 'ping' };
    case 'status':
      return { op: 'status' };
    case 'codes':
      return { op: 'codes' };
    case 'lock':
      return { op: 'lock' };
    case 'export':
      return { op: 'export' };
    case 'selftest':
      return { op: 'selftest' };
    case 'clipboardClear':
      return { op: 'clipboardClear' };
    case 'create': {
      const password = str(message.password);
      const level = tier(message.tier);
      if (password === null) return null;
      return { op: 'create', password, tier: level ?? 'medium' };
    }
    case 'unlock': {
      const password = str(message.password);
      if (password === null) return null;
      return { op: 'unlock', password };
    }
    case 'add': {
      const input = entryInput(message.input);
      if (input === null) return null;
      return { op: 'add', input };
    }
    case 'remove':
    case 'pin':
    case 'bump': {
      const value = id(message.id);
      if (value === null) return null;
      return { op: op as 'remove' | 'pin' | 'bump', id: value };
    }
    case 'import': {
      const text = typeof message.text === 'string' ? message.text : null;
      const password = str(message.password);
      if (text === null || text.length === 0 || text.length > MAX_IMPORT_CHARS) return null;
      if (password === null) return null;
      return { op: 'import', text, password };
    }
    case 'rewrap': {
      const oldPassword = str(message.oldPassword);
      const newPassword = str(message.newPassword);
      if (oldPassword === null || newPassword === null) return null;
      return { op: 'rewrap', oldPassword, newPassword, tier: tier(message.tier) };
    }
    case 'setSettings': {
      const patch = settingsPatch(message.patch);
      if (patch === null) return null;
      return { op: 'setSettings', patch };
    }
    default:
      return null;
  }
}

/** 深度优先找 secret 字段，命中就说明有代码把种子塞进了返回值 */
export function findSecretKey(value: unknown, path = '', depth = 0): string | null {
  if (depth > 8 || typeof value !== 'object' || value === null) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findSecretKey(value[i], `${path}[${i}]`, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path === '' ? key : `${path}.${key}`;
    if (key === 'secret' || key === 'secrets') return here;
    const found = findSecretKey(child, here, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

export class ProtocolViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolViolation';
  }
}

/** 出站前的最后一道闸：带 secret 的结果直接丢掉，宁可不回也不泄露 */
export function assertNoSecretPayload(value: unknown): void {
  const found = findSecretKey(value);
  if (found !== null) throw new ProtocolViolation(`返回值里出现种子字段：${found}`);
}

export function okReply<T>(data: T): VaultReply<T> {
  assertNoSecretPayload(data);
  return { ok: true, data };
}

export function errorReply(error: unknown): VaultReply<never> {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      ok: false,
      error: { message: error.message, code: typeof code === 'string' ? code : undefined },
    };
  }
  return { ok: false, error: { message: '未知错误' } };
}

export function isReply(value: unknown): value is VaultReply {
  if (typeof value !== 'object' || value === null) return false;
  const reply = value as Record<string, unknown>;
  return reply.ok === true || reply.ok === false;
}
