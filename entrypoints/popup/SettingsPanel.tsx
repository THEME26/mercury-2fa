import { useRef, useState } from 'react';
import { toErrorMessage } from '../../lib/errors';
import { vaultService } from '../../lib/remote-client';
import type { VaultStatus } from '../../lib/types';
import type { SelfTestReport } from '../../lib/vault-service';

interface Props {
  status: VaultStatus;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

const LOCK_OPTIONS = [
  { value: 5 * 60 * 1000, label: '5 分钟' },
  { value: 15 * 60 * 1000, label: '15 分钟' },
  { value: 30 * 60 * 1000, label: '30 分钟' },
  { value: 60 * 60 * 1000, label: '60 分钟' },
];

const CLIP_OPTIONS = [
  { value: 0, label: '不清空' },
  { value: 30_000, label: '30 秒清空' },
  { value: 60_000, label: '1 分钟清空' },
  { value: 120_000, label: '2 分钟清空' },
];

function formatTime(at: number | undefined): string {
  if (typeof at !== 'number') return '从未导出';
  const days = Math.floor((Date.now() - at) / 86_400_000);
  const stamp = new Date(at).toLocaleDateString('zh-CN');
  return days <= 0 ? `${stamp}（今天）` : `${stamp}（${days} 天前）`;
}

function download(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsPanel({ status, onChanged, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');

  const [backupText, setBackupText] = useState('');
  const [backupName, setBackupName] = useState('');
  const [backupPassword, setBackupPassword] = useState('');

  const [report, setReport] = useState<SelfTestReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (tag: string, action: () => Promise<string>) => {
    setBusy(tag);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await onChanged();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const changeLock = (value: number) =>
    run('lock', async () => {
      await vaultService.setSettings({ lockAfterMs: value });
      return '已更新自动锁定时间';
    });

  const changePassword = () => {
    if (newPassword !== repeatPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    void run('password', async () => {
      await vaultService.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setRepeatPassword('');
      return '主密码已更换，库体未重写';
    });
  };

  const exportBackup = () =>
    run('export', async () => {
      const text = await vaultService.exportBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      download(`mercury-2fa-backup-${stamp}.json`, text);
      return '加密备份已导出';
    });

  const restoreBackup = () =>
    run('restore', async () => {
      const result = await vaultService.importBackup(backupText, backupPassword);
      setBackupText('');
      setBackupName('');
      setBackupPassword('');
      return `恢复 ${result.imported} 条${result.skipped > 0 ? `，跳过 ${result.skipped} 条` : ''}`;
    });

  const selfTest = () =>
    run('selftest', async () => {
      const result = await vaultService.selfTest();
      setReport(result);
      return result.roundTripOk && result.wrongPasswordRejected && result.tamperRejected
        ? '自检通过'
        : '自检未通过，请勿使用';
    });

  const kdf = status.kdf;

  return (
    <div className="panel">
      <div className="panel-title">设置</div>

      <div className="section">
        <div className="section-title">自动锁定</div>
        <select
          className="input"
          value={status.settings.lockAfterMs}
          onChange={(event) => void changeLock(Number(event.target.value))}
        >
          {LOCK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              空闲 {option.label} 后锁定
            </option>
          ))}
        </select>
        <p className="hint">
          当前派生参数：m={kdf ? Math.round(kdf.m / 1024) : '?'}MiB · t={kdf?.t ?? '?'} · p={kdf?.p ?? '?'}
        </p>
      </div>

      <div className="section">
        <div className="section-title">剪贴板</div>
        <select
          className="input"
          value={status.settings.clipboardClearMs}
          onChange={(event) =>
            void run('clip', async () => {
              await vaultService.setSettings({ clipboardClearMs: Number(event.target.value) });
              return '已更新剪贴板清空时间';
            })
          }
        >
          {CLIP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              复制后{option.label}
            </option>
          ))}
        </select>
        <p className="hint">
          到点由后台覆写剪贴板。这期间复制了别的内容也会被一并清掉 —— 扩展不申请读取剪贴板的权限，
          分辨不出当前内容是不是自己写的。
        </p>
      </div>

      <div className="section">
        <div className="section-title">更换主密码</div>
        <input
          className="input"
          type="password"
          placeholder="原主密码"
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="新主密码（至少 8 位）"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="再输一次新密码"
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
        />
        <button
          className="btn"
          onClick={changePassword}
          disabled={busy !== null || oldPassword === '' || newPassword === ''}
        >
          {busy === 'password' ? '处理中…' : '更换'}
        </button>
      </div>

      <div className="section">
        <div className="section-title">加密备份</div>
        <button className="btn" onClick={exportBackup} disabled={busy !== null}>
          {busy === 'export' ? '导出中…' : '导出备份文件'}
        </button>
        <p className="hint">导出内容是密文，可以安全地放到 U 盘或网盘，恢复时需要主密码。</p>
        <p className="hint">
          上次导出：{formatTime(status.settings.lastBackupAt)}
          {status.entryCount > 0 &&
            (status.settings.lastBackupAt === undefined ||
              Date.now() - status.settings.lastBackupAt > 30 * 86_400_000) &&
            ' · 超过 30 天会在图标上挂提醒'}
        </p>

        <div className="inline">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            {backupName || '选择备份文件'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setBackupText(await file.text());
              setBackupName(file.name);
            }}
          />
        </div>
        {backupText !== '' && (
          <div className="inline">
            <input
              className="input"
              type="password"
              placeholder="备份的主密码"
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
            />
            <button className="btn" onClick={restoreBackup} disabled={busy !== null || backupPassword === ''}>
              {busy === 'restore' ? '恢复中…' : '恢复'}
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">加密自检</div>
        <button className="btn" onClick={selfTest} disabled={busy !== null}>
          {busy === 'selftest' ? '运行中…' : '运行自检'}
        </button>
        {report && (
          <div className="report">
            <div>派生耗时 {report.deriveMs}ms · 密文 {report.ciphertextBytes} 字节</div>
            <div>往返解密 {report.roundTripOk ? '通过' : '失败'}</div>
            <div>错误密码拒绝 {report.wrongPasswordRejected ? '通过' : '失败'}</div>
            <div>篡改检测 {report.tamperRejected ? '通过' : '失败'}</div>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {message && <div className="ok">{message}</div>}

      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          返回
        </button>
      </div>
    </div>
  );
}
