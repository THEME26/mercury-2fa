import { browser } from 'wxt/browser';
import { normalizeSecret } from './base32';
import { parseOtpAuthUri } from './otpauth';
import type { HmacAlgorithm, OtpEntry, OtpType } from './types';

const VAULT_KEY = 'vault.v1';
const DEV_ACK_KEY = 'ui.devAck.v1';

/**
 * v0.1 的存储格式：明文。encrypted 字段现在就固定写 false，
 * v0.2 接入 Argon2id 后改成 true，读取时按字段分派解密路径。
 */
export interface VaultFile {
  schemaVersion: 1;
  encrypted: false;
  entries: OtpEntry[];
}

export interface ManualInput {
  type: OtpType;
  issuer: string;
  account: string;
  secret: string;
  algorithm?: HmacAlgorithm;
  digits?: number;
  period?: number;
  counter?: number;
}

export interface NewEntryInput {
  uri?: string;
  manual?: ManualInput;
}

const EMPTY_VAULT: VaultFile = { schemaVersion: 1, encrypted: false, entries: [] };

async function readVault(): Promise<VaultFile> {
  const stored = await browser.storage.local.get(VAULT_KEY);
  const file = stored[VAULT_KEY] as VaultFile | undefined;
  if (!file || !Array.isArray(file.entries)) return { ...EMPTY_VAULT };
  return file;
}

async function writeVault(file: VaultFile): Promise<void> {
  await browser.storage.local.set({ [VAULT_KEY]: file });
}

function sortEntries(entries: OtpEntry[]): OtpEntry[] {
  return [...entries].sort((a, b) => {
    const left = `${a.issuer}\u0000${a.account}`.toLowerCase();
    const right = `${b.issuer}\u0000${b.account}`.toLowerCase();
    return left.localeCompare(right);
  });
}

function buildEntry(input: ManualInput): OtpEntry {
  const secret = normalizeSecret(input.secret);
  const type = input.type;
  const isSteam = type === 'steam';

  return {
    id: crypto.randomUUID(),
    type,
    issuer: input.issuer.trim() || (isSteam ? 'Steam' : '未命名'),
    account: input.account.trim(),
    secret,
    algorithm: isSteam ? 'SHA-1' : (input.algorithm ?? 'SHA-1'),
    digits: isSteam ? 5 : clamp(input.digits ?? 6, 4, 10),
    period: isSteam ? 30 : clamp(input.period ?? 30, 1, 600),
    counter: type === 'hotp' ? Math.max(0, Math.floor(input.counter ?? 0)) : undefined,
    createdAt: Date.now(),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export async function listEntries(): Promise<OtpEntry[]> {
  const vault = await readVault();
  return sortEntries(vault.entries);
}

export async function addEntry(input: NewEntryInput): Promise<OtpEntry> {
  const parsed = input.uri
    ? (() => {
        const p = parseOtpAuthUri(input.uri);
        return {
          type: p.type,
          issuer: p.issuer,
          account: p.account,
          secret: p.secret,
          algorithm: p.algorithm,
          digits: p.digits,
          period: p.period,
          counter: p.counter,
        } satisfies ManualInput;
      })()
    : input.manual;

  if (!parsed) throw new Error('没有可导入的内容');

  const entry = buildEntry(parsed);
  const vault = await readVault();

  const duplicated = vault.entries.some(
    (existing) =>
      existing.secret === entry.secret &&
      existing.issuer.toLowerCase() === entry.issuer.toLowerCase() &&
      existing.account.toLowerCase() === entry.account.toLowerCase(),
  );
  if (duplicated) throw new Error('这个账号已经在库里了');

  await writeVault({ ...vault, entries: [...vault.entries, entry] });
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const vault = await readVault();
  await writeVault({ ...vault, entries: vault.entries.filter((entry) => entry.id !== id) });
}

export async function exportVault(): Promise<string> {
  const vault = await readVault();
  return JSON.stringify(
    { schemaVersion: vault.schemaVersion, exportedAt: new Date().toISOString(), entries: vault.entries },
    null,
    2,
  );
}

export async function isDevAcknowledged(): Promise<boolean> {
  const stored = await browser.storage.local.get(DEV_ACK_KEY);
  return stored[DEV_ACK_KEY] === true;
}

export async function acknowledgeDevMode(): Promise<void> {
  await browser.storage.local.set({ [DEV_ACK_KEY]: true });
}
