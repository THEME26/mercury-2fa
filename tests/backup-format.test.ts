import { describe, expect, it } from 'vitest';
import { MemoryCryptoHost } from '../lib/crypto-host';
import { BackupError, VaultError } from '../lib/errors';
import { MemoryStore } from '../lib/storage';
import { VaultService } from '../lib/vault-service';

const PASSWORD = 'password-123';
const GITHUB_URI = 'otpauth://totp/GitHub:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
const AWS_URI = 'otpauth://totp/AWS:ops%40acme.dev?secret=KRSXG5CTMVRXEZLU&issuer=AWS';

function setup() {
  const local = new MemoryStore();
  const session = new MemoryStore();
  const service = new VaultService(local, session, new MemoryCryptoHost(), () => 1_700_000_000_000);
  return { local, session, service };
}

async function seededService() {
  const ctx = setup();
  await ctx.service.create(PASSWORD, 'low');
  await ctx.service.add({ uri: GITHUB_URI });
  await ctx.service.add({ uri: AWS_URI });
  return ctx;
}

async function catchError(run: () => Promise<unknown>): Promise<unknown> {
  return run().then(
    () => undefined,
    (cause: unknown) => cause,
  );
}

describe('备份文件的错误分级', () => {
  it('非 JSON 报「损坏」', async () => {
    const { service } = setup();
    const error = await catchError(() => service.importBackup('not json at all', PASSWORD));
    expect(error).toBeInstanceOf(BackupError);
    expect((error as BackupError).reason).toBe('json');
    expect((error as BackupError).message).toMatch(/损坏/);
  });

  it('别的 JSON 报「不是本扩展的备份」', async () => {
    const { service } = setup();
    const foreign = JSON.stringify({ format: 'bitwarden-backup', version: 1, vault: {} });
    const error = await catchError(() => service.importBackup(foreign, PASSWORD));
    expect((error as BackupError).reason).toBe('magic');
    expect((error as BackupError).message).toMatch(/不是 Mercury 2FA/);
  });

  it('更高版本报「请先升级」', async () => {
    const { service } = await seededService();
    const text = await service.exportBackup();
    const bumped = JSON.stringify({ ...JSON.parse(text), version: 3 });
    const error = await catchError(() => service.importBackup(bumped, PASSWORD));
    expect((error as BackupError).reason).toBe('version');
    expect((error as BackupError).message).toMatch(/升级/);
  });

  it('密文被截断报「不完整」，不冒充密码错误', async () => {
    const { service } = await seededService();
    const file = JSON.parse(await service.exportBackup());
    const data: string = file.vault.payload.data;
    file.vault.payload.data = data.slice(0, Math.floor(data.length / 2));
    const error = await catchError(() => service.importBackup(JSON.stringify(file), PASSWORD));
    expect((error as BackupError).reason).toBe('structure');
    expect((error as BackupError).message).toMatch(/损坏|不完整/);
  });

  it('密码错误单独报「密码不正确」', async () => {
    const { service } = await seededService();
    const text = await service.exportBackup();
    const error = await catchError(() => service.importBackup(text, 'wrong-password-1'));
    expect(error).toBeInstanceOf(VaultError);
    expect((error as VaultError).code).toBe('wrong-password');
  });
});

describe('恢复时的条数核对', () => {
  it('导出的文件带明文条数', async () => {
    const { service } = await seededService();
    const file = JSON.parse(await service.exportBackup());
    expect(file.entryCount).toBe(2);
    expect(file.vault.entryCount).toBe(2);
  });

  it('条数对不上就拒绝，并报出两个数字', async () => {
    const { service } = await seededService();
    const file = JSON.parse(await service.exportBackup());
    file.entryCount = 9;
    file.vault.entryCount = 9;
    const target = setup();
    await target.service.create(PASSWORD, 'low');

    const error = await catchError(() => target.service.importBackup(JSON.stringify(file), PASSWORD));
    expect(error).toBeInstanceOf(BackupError);
    expect((error as BackupError).reason).toBe('structure');
    expect((error as BackupError).message).toMatch(/9/);
    expect((error as BackupError).message).toMatch(/2/);
  });

  it('完整备份在另一个库里恢复，条数与内容一致', async () => {
    const { service } = await seededService();
    const text = await service.exportBackup();

    const target = setup();
    await target.service.create(PASSWORD, 'low');
    const result = await target.service.importBackup(text, PASSWORD);
    expect(result).toEqual({ imported: 2, skipped: 0 });

    const codes = await target.service.listCodes();
    expect(codes.map((entry) => entry.issuer).sort()).toEqual(['AWS', 'GitHub']);
    expect(codes.every((entry) => /^\d{6}$/.test(entry.code))).toBe(true);
  });

  it('重复导入同一条目全部跳过', async () => {
    const { service } = await seededService();
    const text = await service.exportBackup();
    const again = await service.importBackup(text, PASSWORD);
    expect(again).toEqual({ imported: 0, skipped: 2 });
  });
});
