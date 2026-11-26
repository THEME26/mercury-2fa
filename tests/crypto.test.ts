import { describe, expect, it } from 'vitest';
import {
  createVault,
  deriveKek,
  fromBase64,
  isWrongPassword,
  makeBackup,
  makeKdfParams,
  openVault,
  parseBackup,
  rewrapVault,
  sealedSize,
  toBase64,
  type VaultV2,
} from '../lib/crypto';

const LOW = 'low' as const;

function flipBase64(text: string): string {
  const bytes = fromBase64(text);
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return toBase64(bytes);
}

async function expectRejectedAsWrongPassword(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(isWrongPassword(error)).toBe(true);
}

describe('Argon2id 派生', () => {
  it('同参数同盐得出同一密钥', async () => {
    const params = makeKdfParams(LOW);
    const a = await deriveKek('correct horse battery staple', params);
    const b = await deriveKek('correct horse battery staple', params);
    expect(toBase64(a)).toBe(toBase64(b));
    expect(a.length).toBe(32);
  });

  it('换盐或换密码都会改变输出', async () => {
    const params = makeKdfParams(LOW);
    const other = makeKdfParams(LOW);
    const base = toBase64(await deriveKek('same-password', params));
    expect(toBase64(await deriveKek('same-password', other))).not.toBe(base);
    expect(toBase64(await deriveKek('other-password', params))).not.toBe(base);
  });
});

describe('保险库加解密', () => {
  it('创建后能用同一密码打开，内容一致', async () => {
    const entries = [{ issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP' }];
    const { vault } = await createVault('password-123', entries, LOW);
    const opened = await openVault(vault, 'password-123');
    expect(opened.entries).toEqual(entries);
    expect(vault.schemaVersion).toBe(2);
    expect(vault.kdf.name).toBe('argon2id');
  });

  it('错误密码被 AES-GCM 认证拒绝', async () => {
    const { vault } = await createVault('password-123', [], LOW);
    await expectRejectedAsWrongPassword(openVault(vault, 'password-124'));
  });

  it('密文被篡改一个字节就解不开', async () => {
    const { vault } = await createVault('password-123', [{ a: 1 }], LOW);
    const tampered: VaultV2 = { ...vault, payload: { ...vault.payload, data: flipBase64(vault.payload.data) } };
    await expect(openVault(tampered, 'password-123')).rejects.toThrow();
  });

  it('DEK 封装被篡改同样拒绝', async () => {
    const { vault } = await createVault('password-123', [], LOW);
    const tampered: VaultV2 = {
      ...vault,
      wrappedDek: { ...vault.wrappedDek, data: flipBase64(vault.wrappedDek.data) },
    };
    await expectRejectedAsWrongPassword(openVault(tampered, 'password-123'));
  });

  it('同一份明文每次加密的 IV 都不同', async () => {
    const a = await createVault('password-123', [{ x: 1 }], LOW);
    const b = await createVault('password-123', [{ x: 1 }], LOW);
    expect(a.vault.payload.iv).not.toBe(b.vault.payload.iv);
    expect(a.vault.payload.data).not.toBe(b.vault.payload.data);
  });

  it('明文不出现在序列化结果里', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const { vault } = await createVault('password-123', [{ secret }], LOW);
    const serialized = JSON.stringify(vault);
    expect(serialized.includes(secret)).toBe(false);
    expect(serialized.includes('GitHub')).toBe(false);
    expect(sealedSize(vault.payload)).toBeGreaterThan(0);
  });
});

describe('改主密码', () => {
  it('只换 KEK，库体不变，新旧密码都能验证', async () => {
    const entries = [{ issuer: 'AWS', secret: 'KRSXG5CTMVRXEZLU' }];
    const { vault, dek } = await createVault('old-password', entries, LOW);
    const rewrapped = await rewrapVault(vault, dek, 'new-password');

    expect(rewrapped.payload).toEqual(vault.payload);
    expect(rewrapped.kdf.salt).not.toBe(vault.kdf.salt);

    await expectRejectedAsWrongPassword(openVault(rewrapped, 'old-password'));
    const opened = await openVault(rewrapped, 'new-password');
    expect(opened.entries).toEqual(entries);
  });
});

describe('备份文件', () => {
  it('导出再解析得到同一份密文', async () => {
    const { vault } = await createVault('password-123', [{ a: 1 }], LOW);
    const restored = parseBackup(JSON.stringify(makeBackup(vault)));
    expect(restored).toEqual(vault);
  });

  it('拒绝非法输入', () => {
    expect(() => parseBackup('not json')).toThrow(/JSON/);
    expect(() => parseBackup(JSON.stringify({ format: 'other' }))).toThrow(/格式/);
  });
});
