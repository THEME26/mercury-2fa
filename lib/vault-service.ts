import { normalizeSecret } from './base32';
import {
  aesDecrypt,
  createVault,
  isWrongPassword,
  makeBackup,
  openVault,
  parseBackup,
  rewrapVault,
  type Sealed,
  type VaultV2,
} from './crypto';
import type { CryptoHost } from './crypto-host';
import { BackupError, VaultError } from './errors';
import { hotp } from './hotp';
import { parseOtpAuthUri } from './otpauth';
import type { KeyValueStore } from './storage';
import { steamTotp, totp } from './totp';
import type {
  EntryRecord,
  EntryView,
  KdfTier,
  ManualInput,
  NewEntryInput,
  Settings,
  VaultStatus,
} from './types';

const VAULT_KEY = 'vault.v2';
const LEGACY_KEY = 'vault.v1';
const SETTINGS_KEY = 'settings.v1';
const ACTIVITY_KEY = 'session.lastActivity';

export const DEFAULT_SETTINGS: Settings = {
  lockAfterMs: 15 * 60 * 1000,
  clipboardClearMs: 30_000,
  kdfTier: 'medium',
};

export interface SelfTestReport {
  deriveMs: number;
  roundTripOk: boolean;
  wrongPasswordRejected: boolean;
  tamperRejected: boolean;
  ciphertextBytes: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function sortEntries(entries: EntryRecord[]): EntryRecord[] {
  return [...entries].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const left = `${a.issuer}\u0000${a.account}`.toLowerCase();
    const right = `${b.issuer}\u0000${b.account}`.toLowerCase();
    return left.localeCompare(right);
  });
}

export class VaultService {
  constructor(
    private readonly local: KeyValueStore,
    private readonly session: KeyValueStore,
    private readonly host: CryptoHost,
    private readonly now: () => number = Date.now,
  ) {}

  private async getVault(): Promise<VaultV2 | undefined> {
    return this.local.get<VaultV2>(VAULT_KEY);
  }

  private async saveVault(vault: VaultV2, entryCount?: number): Promise<void> {
    const next = entryCount === undefined ? vault : { ...vault, entryCount };
    await this.local.set(VAULT_KEY, next);
  }

  private async touch(): Promise<void> {
    await this.session.set(ACTIVITY_KEY, this.now());
  }

  async getSettings(): Promise<Settings> {
    const stored = await this.local.get<Partial<Settings>>(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch };
    await this.local.set(SETTINGS_KEY, next);
    return next;
  }

  async status(): Promise<VaultStatus> {
    const vault = await this.getVault();
    const legacy = await this.local.get<{ entries?: EntryRecord[] }>(LEGACY_KEY);
    const settings = await this.getSettings();
    const hasLegacy = Array.isArray(legacy?.entries) && legacy.entries.length > 0;

    if (!vault) {
      return { state: 'empty', hasLegacy, entryCount: 0, kdf: null, settings };
    }

    const unlocked = await this.host.isUnlocked();
    if (!unlocked) {
      return {
        state: 'locked',
        hasLegacy,
        entryCount: 0,
        kdf: { m: vault.kdf.m, t: vault.kdf.t, p: vault.kdf.p },
        settings,
      };
    }

    const last = await this.session.get<number>(ACTIVITY_KEY);
    if (last !== undefined && this.now() - last > settings.lockAfterMs) {
      await this.lock();
      return {
        state: 'locked',
        hasLegacy,
        entryCount: 0,
        kdf: { m: vault.kdf.m, t: vault.kdf.t, p: vault.kdf.p },
        settings,
      };
    }
    if (last === undefined) await this.touch();

    const entries = await this.loadEntries(vault);
    return {
      state: 'unlocked',
      hasLegacy,
      entryCount: entries.length,
      kdf: { m: vault.kdf.m, t: vault.kdf.t, p: vault.kdf.p },
      settings,
    };
  }

  private async loadEntries(vault: VaultV2): Promise<EntryRecord[]> {
    const raw = await this.host.decryptPayload(vault.payload);
    return Array.isArray(raw) ? (raw as EntryRecord[]) : [];
  }

  private async ensureUnlocked(): Promise<{ vault: VaultV2; entries: EntryRecord[] }> {
    const vault = await this.getVault();
    if (!vault) throw new VaultError('empty', '还没有创建保险库');
    if (!(await this.host.isUnlocked())) throw new VaultError('locked', '保险库已锁定');

    const settings = await this.getSettings();
    const last = await this.session.get<number>(ACTIVITY_KEY);
    if (last !== undefined && this.now() - last > settings.lockAfterMs) {
      await this.lock();
      throw new VaultError('locked', '空闲超时，已自动锁定');
    }
    await this.touch();
    return { vault, entries: await this.loadEntries(vault) };
  }

  async create(password: string, tier: KdfTier): Promise<number> {
    if (await this.getVault()) throw new VaultError('exists', '保险库已存在');
    if (password.length < 8) throw new VaultError('invalid', '主密码至少 8 位');

    const legacy = await this.local.get<{ entries?: EntryRecord[] }>(LEGACY_KEY);
    const entries = Array.isArray(legacy?.entries) ? legacy.entries : [];

    const vault = await this.host.create(password, entries, tier);
    await this.saveVault(vault, entries.length);
    await this.local.remove(LEGACY_KEY);
    await this.local.remove('ui.devAck.v1');
    await this.setSettings({ kdfTier: tier });
    await this.touch();
    return entries.length;
  }

  async unlock(password: string): Promise<number> {
    const vault = await this.getVault();
    if (!vault) throw new VaultError('empty', '还没有创建保险库');
    const entries = (await this.host.unlock(password, vault)) as EntryRecord[] | undefined;
    await this.touch();
    return Array.isArray(entries) ? entries.length : 0;
  }

  async lock(): Promise<void> {
    await this.host.lock();
    await this.session.remove(ACTIVITY_KEY);
  }

  async listCodes(): Promise<EntryView[]> {
    const { entries } = await this.ensureUnlocked();
    const now = this.now();
    const views: EntryView[] = [];

    /** 同一个种子挂在多个账号上是配置错误，标出来让用户自己决定要不要拆 */
    const usage = new Map<string, number>();
    for (const entry of entries) usage.set(entry.secret, (usage.get(entry.secret) ?? 0) + 1);

    for (const entry of sortEntries(entries)) {
      if (entry.type === 'steam') {
        const result = await steamTotp(entry.secret, now);
        views.push(this.toView(entry, result.code, result.expiresAt, result.step, usage));
        continue;
      }
      if (entry.type === 'hotp') {
        const counter = entry.counter ?? 0;
        const code = await hotp({
          secret: entry.secret,
          counter,
          digits: entry.digits,
          algorithm: entry.algorithm,
        });
        views.push(this.toView(entry, code, 0, counter, usage));
        continue;
      }
      const result = await totp({
        secret: entry.secret,
        time: now,
        period: entry.period,
        digits: entry.digits,
        algorithm: entry.algorithm,
      });
      views.push(this.toView(entry, result.code, result.expiresAt, result.step, usage));
    }
    return views;
  }

  private toView(
    entry: EntryRecord,
    code: string,
    expiresAt: number,
    step: number,
    usage: Map<string, number>,
  ): EntryView {
    return {
      id: entry.id,
      type: entry.type,
      issuer: entry.issuer,
      account: entry.account,
      digits: entry.digits,
      period: entry.period,
      pinned: Boolean(entry.pinned),
      sharedSecret: (usage.get(entry.secret) ?? 1) > 1,
      code,
      expiresAt,
      step,
    };
  }

  async add(input: NewEntryInput): Promise<EntryRecord> {
    const { vault, entries } = await this.ensureUnlocked();

    let manual: ManualInput | undefined = input.manual;
    if (input.uri) {
      const parsed = parseOtpAuthUri(input.uri);
      manual = {
        type: parsed.type,
        issuer: parsed.issuer,
        account: parsed.account,
        secret: parsed.secret,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        counter: parsed.counter,
      };
    }
    if (!manual) throw new VaultError('invalid', '没有可导入的内容');

    const entry = this.buildEntry(manual);
    const duplicated = entries.some(
      (existing) =>
        existing.secret === entry.secret &&
        existing.issuer.toLowerCase() === entry.issuer.toLowerCase() &&
        existing.account.toLowerCase() === entry.account.toLowerCase(),
    );
    if (duplicated) throw new VaultError('invalid', '这个账号已经在库里了');

    const next = sortEntries([...entries, entry]);
    await this.saveVault({ ...vault, payload: await this.host.sealEntries(next) }, next.length);
    return entry;
  }

  private buildEntry(input: ManualInput): EntryRecord {
    const isSteam = input.type === 'steam';
    return {
      id: crypto.randomUUID(),
      type: input.type,
      issuer: input.issuer.trim() || (isSteam ? 'Steam' : '未命名'),
      account: input.account.trim(),
      secret: normalizeSecret(input.secret),
      algorithm: isSteam ? 'SHA-1' : (input.algorithm ?? 'SHA-1'),
      digits: isSteam ? 5 : clamp(input.digits ?? 6, 4, 10),
      period: isSteam ? 30 : clamp(input.period ?? 30, 1, 600),
      counter: input.type === 'hotp' ? Math.max(0, Math.floor(input.counter ?? 0)) : undefined,
      createdAt: this.now(),
      pinned: false,
    };
  }

  async remove(id: string): Promise<void> {
    const { vault, entries } = await this.ensureUnlocked();
    const next = entries.filter((entry) => entry.id !== id);
    await this.saveVault({ ...vault, payload: await this.host.sealEntries(next) }, next.length);
  }

  async togglePin(id: string): Promise<boolean> {
    const { vault, entries } = await this.ensureUnlocked();
    let pinned = false;
    const next = entries.map((entry) => {
      if (entry.id !== id) return entry;
      pinned = !entry.pinned;
      return { ...entry, pinned };
    });
    await this.saveVault({ ...vault, payload: await this.host.sealEntries(next) }, next.length);
    return pinned;
  }

  /** HOTP 用过一次就把计数器递增落盘，避免重复点击导致计数器错位 */
  async bumpCounter(id: string): Promise<number> {
    const { vault, entries } = await this.ensureUnlocked();
    let counter = 0;
    const next = entries.map((entry) => {
      if (entry.id !== id || entry.type !== 'hotp') return entry;
      counter = (entry.counter ?? 0) + 1;
      return { ...entry, counter };
    });
    await this.saveVault({ ...vault, payload: await this.host.sealEntries(next) }, next.length);
    return counter;
  }

  async exportBackup(): Promise<string> {
    const vault = await this.getVault();
    if (!vault) throw new VaultError('empty', '还没有创建保险库');
    await this.setSettings({ lastBackupAt: this.now() });
    await this.touch();
    return JSON.stringify(makeBackup(vault), null, 2);
  }

  async importBackup(text: string, password: string): Promise<{ imported: number; skipped: number }> {
    const incoming = parseBackup(text);
    let incomingEntries: EntryRecord[];
    try {
      const opened = await openVault(incoming, password);
      incomingEntries = Array.isArray(opened.entries) ? (opened.entries as EntryRecord[]) : [];
    } catch (error) {
      /** BackupError 先说：密文被改过时 AES-GCM 也报 OperationError，不能当成密码错 */
      if (error instanceof BackupError) throw error;
      if (isWrongPassword(error)) throw new VaultError('wrong-password', '备份密码不正确');
      throw new BackupError('structure', '备份内容无法解密，文件可能已损坏');
    }
    /** 文件里带了明文条数就核对，解出的数量对不上说明内容不全 */
    if (typeof incoming.entryCount === 'number' && incoming.entryCount !== incomingEntries.length) {
      throw new BackupError(
        'structure',
        `备份内容不完整：声明 ${incoming.entryCount} 条，实际解出 ${incomingEntries.length} 条`,
      );
    }

    const { vault, entries } = await this.ensureUnlocked();
    const seen = new Set(entries.map((entry) => `${entry.secret}|${entry.issuer}|${entry.account}`));
    let imported = 0;
    let skipped = 0;

    for (const candidate of incomingEntries) {
      const key = `${candidate.secret}|${candidate.issuer}|${candidate.account}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      imported += 1;
      entries.push({ ...candidate, id: crypto.randomUUID() });
    }

    if (imported > 0) {
      await this.saveVault({ ...vault, payload: await this.host.sealEntries(sortEntries(entries)) }, entries.length);
    }
    return { imported, skipped };
  }

  async changePassword(oldPassword: string, newPassword: string, tier?: KdfTier): Promise<void> {
    const vault = await this.getVault();
    if (!vault) throw new VaultError('empty', '还没有创建保险库');
    if (newPassword.length < 8) throw new VaultError('invalid', '新主密码至少 8 位');

    let dek: Uint8Array;
    try {
      dek = (await openVault(vault, oldPassword)).dek;
    } catch (error) {
      if (isWrongPassword(error)) throw new VaultError('wrong-password', '原主密码不正确');
      throw error;
    }
    const next = await rewrapVault(vault, dek, newPassword, tier);
    await this.saveVault(next, vault.entryCount ?? 0);
    if (tier) await this.setSettings({ kdfTier: tier });
    await this.touch();
  }

  async selfTest(): Promise<SelfTestReport> {
    const password = `probe-${Math.random().toString(36).slice(2)}`;
    const started = this.now();
    const { vault, dek } = await createVault(password, [{ probe: true }], 'low');
    const deriveMs = this.now() - started;

    const opened = await openVault(vault, password);
    const roundTripOk = JSON.stringify(opened.entries) === JSON.stringify([{ probe: true }]);

    let wrongPasswordRejected = false;
    try {
      await openVault(vault, `${password}x`);
    } catch (error) {
      wrongPasswordRejected = isWrongPassword(error);
    }

    let tamperRejected = false;
    try {
      const bytes = Uint8Array.from(atob(vault.payload.data), (ch) => ch.charCodeAt(0));
      bytes[0] = (bytes[0] ?? 0) ^ 0xff;
      const tampered: Sealed = { ...vault.payload, data: btoa(String.fromCharCode(...bytes)) };
      await aesDecrypt(dek, tampered);
    } catch {
      tamperRejected = true;
    }

    return {
      deriveMs,
      roundTripOk,
      wrongPasswordRejected,
      tamperRejected,
      ciphertextBytes: Math.floor((vault.payload.data.length * 3) / 4),
    };
  }
}
