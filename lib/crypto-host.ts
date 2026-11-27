import {
  aesDecrypt,
  aesEncrypt,
  createVault,
  isWrongPassword,
  openVault,
  rewrapVault,
  type Sealed,
  type VaultV2,
} from './crypto';
import { VaultError } from './errors';
import type { KdfTier } from './types';

/**
 * 加密能力的抽象边界。
 * 实现必须把 DEK 留在进程内存里，不允许写入 storage —— 写进去就等于把种子交给
 * 任何能读 storage 的扩展页面。当前唯一实现是 MemoryCryptoHost，运行在 offscreen 文档内。
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

/**
 * DEK 只存在这个模块作用域的变量里。offscreen 文档被销毁、浏览器退出、
 * 或显式调用 lock() 都会让它消失，且无法从外部读取。
 */
export class MemoryCryptoHost implements CryptoHost {
  private dek: Uint8Array | null = null;

  async isUnlocked(): Promise<boolean> {
    return this.dek !== null;
  }

  private requireDek(): Uint8Array {
    if (this.dek === null) throw new VaultError('locked', '保险库已锁定');
    return this.dek;
  }

  async create(password: string, entries: unknown, tier: KdfTier): Promise<VaultV2> {
    const { vault, dek } = await createVault(password, entries, tier);
    this.dek = dek;
    return vault;
  }

  async unlock(password: string, vault: VaultV2): Promise<unknown> {
    try {
      const opened = await openVault(vault, password);
      this.dek = opened.dek;
      return opened.entries;
    } catch (error) {
      if (isWrongPassword(error)) throw new VaultError('wrong-password', '主密码不正确');
      throw error;
    }
  }

  async decryptPayload(payload: Sealed): Promise<unknown> {
    return JSON.parse(new TextDecoder().decode(await aesDecrypt(this.requireDek(), payload)));
  }

  async sealEntries(entries: unknown): Promise<Sealed> {
    return aesEncrypt(this.requireDek(), new TextEncoder().encode(JSON.stringify(entries)));
  }

  async rewrap(vault: VaultV2, newPassword: string, tier?: KdfTier): Promise<VaultV2> {
    return rewrapVault(vault, this.requireDek(), newPassword, tier);
  }

  async lock(): Promise<void> {
    if (this.dek !== null) this.dek.fill(0);
    this.dek = null;
  }
}
