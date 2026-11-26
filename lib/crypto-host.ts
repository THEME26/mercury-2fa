import {
  aesDecrypt,
  aesEncrypt,
  createVault,
  fromBase64,
  isWrongPassword,
  openVault,
  rewrapVault,
  toBase64,
  type Sealed,
  type VaultV2,
} from './crypto';
import { VaultError } from './errors';
import type { KeyValueStore } from './storage';
import type { KdfTier } from './types';

const DEK_KEY = 'session.dek';

/**
 * 加密能力的抽象边界。
 * 现在由 SessionCryptoHost 在 service worker 内实现，DEK 落在 storage.session（内存态）。
 * 换成 offscreen document 时只要换掉这个接口的实现，上层逻辑不动。
 */
export interface CryptoHost {
  isUnlocked(): Promise<boolean>;
  create(password: string, entries: unknown, tier: KdfTier): Promise<VaultV2>;
  unlock(password: string, vault: VaultV2): Promise<unknown>;
  decryptPayload(payload: Sealed): Promise<unknown>;
  sealEntries(entries: unknown): Promise<Sealed>;
  rewrap(vault: VaultV2, newPassword: string, tier?: KdfTier): Promise<VaultV2>;
  lock(): Promise<void>;
}

export class SessionCryptoHost implements CryptoHost {
  constructor(private readonly session: KeyValueStore) {}

  async isUnlocked(): Promise<boolean> {
    return (await this.session.get<string>(DEK_KEY)) !== undefined;
  }

  private async dek(): Promise<Uint8Array> {
    const raw = await this.session.get<string>(DEK_KEY);
    if (raw === undefined) throw new VaultError('locked', '保险库已锁定');
    return fromBase64(raw);
  }

  async create(password: string, entries: unknown, tier: KdfTier): Promise<VaultV2> {
    const { vault, dek } = await createVault(password, entries, tier);
    await this.session.set(DEK_KEY, toBase64(dek));
    return vault;
  }

  async unlock(password: string, vault: VaultV2): Promise<unknown> {
    try {
      const opened = await openVault(vault, password);
      await this.session.set(DEK_KEY, toBase64(opened.dek));
      return opened.entries;
    } catch (error) {
      if (isWrongPassword(error)) throw new VaultError('wrong-password', '主密码不正确');
      throw error;
    }
  }

  async decryptPayload(payload: Sealed): Promise<unknown> {
    return JSON.parse(new TextDecoder().decode(await aesDecrypt(await this.dek(), payload)));
  }

  async sealEntries(entries: unknown): Promise<Sealed> {
    return aesEncrypt(await this.dek(), new TextEncoder().encode(JSON.stringify(entries)));
  }

  async rewrap(vault: VaultV2, newPassword: string, tier?: KdfTier): Promise<VaultV2> {
    return rewrapVault(vault, await this.dek(), newPassword, tier);
  }

  async lock(): Promise<void> {
    await this.session.remove(DEK_KEY);
  }
}
