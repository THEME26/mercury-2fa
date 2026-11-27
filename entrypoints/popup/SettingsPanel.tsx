import { useEffect, useRef, useState } from 'react';
import { backupReminder } from '../../lib/backup-reminder';
import { hasClipboardAccess, requestClipboardAccess } from '../../lib/clipboard';
import { UserError } from '../../lib/errors';
import { describeError } from '../../lib/i18n/describe-error';
import { useI18n } from '../../lib/i18n/react';
import { LOCALES, type Locale } from '../../lib/i18n/locales';
import type { LanguagePreference } from '../../lib/i18n/preference';
import { vaultService } from '../../lib/remote-client';
import type { VaultStatus } from '../../lib/types';
import type { SelfTestReport } from '../../lib/vault-service';

interface Props {
  status: VaultStatus;
  language: LanguagePreference;
  onLanguageChange: (preference: LanguagePreference) => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

const LOCK_OPTIONS = [
  { value: 5 * 60 * 1000, label: '5' },
  { value: 15 * 60 * 1000, label: '15' },
  { value: 30 * 60 * 1000, label: '30' },
  { value: 60 * 60 * 1000, label: '60' },
];

const CLIP_OPTIONS = [
  { value: 0, kind: 'never' as const },
  { value: 30_000, kind: 'seconds' as const, n: 30 },
  { value: 60_000, kind: 'minutes' as const, n: 1 },
  { value: 120_000, kind: 'minutes' as const, n: 2 },
];

function download(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsPanel({ status, language, onLanguageChange, onChanged, onClose }: Props) {
  const { t, locale } = useI18n();
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

  /** null 表示还没问出结果，此时不渲染剪贴板控件，免得闪一下错误的形态 */
  const [clipGranted, setClipGranted] = useState<boolean | null>(null);
  useEffect(() => {
    void hasClipboardAccess().then(setClipGranted);
  }, []);

  const run = async (tag: string, action: () => Promise<string>) => {
    setBusy(tag);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await onChanged();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(null);
    }
  };

  /** 日期按界面语言格式化，`en` 与 `zh-CN` 的显示顺序本来就不一样 */
  const formatTime = (at: number | undefined): string => {
    if (typeof at !== 'number') return t('settings.never');
    const days = Math.floor((Date.now() - at) / 86_400_000);
    const stamp = new Date(at).toLocaleDateString(locale);
    return days <= 0 ? `${stamp} · ${t('settings.today')}` : `${stamp} · ${t('settings.daysAgo', { n: days })}`;
  };

  const changeLock = (value: number) =>
    run('lock', async () => {
      await vaultService.setSettings({ lockAfterMs: value });
      return t('settings.updatedLock');
    });

  /** 图标不再挂角标，备份提醒只在这里出现：从未导出与过期分开措辞 */
  const reminder = backupReminder(status.entryCount, status.settings.lastBackupAt, Date.now());
  const backupNotice =
    reminder === 'never'
      ? t('settings.backupNever')
      : reminder === 'stale'
        ? t('settings.backupStale')
        : '';

  /** 授权气泡挂在扩展图标上，必须由这次点击触发 */
  const enableClipboard = () =>
    run('clipPerm', async () => {
      const granted = await requestClipboardAccess();
      setClipGranted(granted);
      if (!granted) throw new UserError('error.clipboard.permission');
      if (status.settings.clipboardClearMs <= 0) {
        await vaultService.setSettings({ clipboardClearMs: 30_000 });
      }
      return t('settings.clipEnabled');
    });

  const changePassword = () => {
    if (newPassword !== repeatPassword) {
      setError(t('settings.passwordMismatch'));
      return;
    }
    void run('password', async () => {
      await vaultService.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setRepeatPassword('');
      return t('settings.passwordChanged');
    });
  };

  const exportBackup = () =>
    run('export', async () => {
      const text = await vaultService.exportBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      download(`mercury-2fa-backup-${stamp}.json`, text);
      return t('settings.exported');
    });

  const restoreBackup = () =>
    run('restore', async () => {
      const result = await vaultService.importBackup(backupText, backupPassword);
      setBackupText('');
      setBackupName('');
      setBackupPassword('');
      return result.skipped > 0
        ? t('settings.restoredSkipped', { n: result.imported, m: result.skipped })
        : t('settings.restored', { n: result.imported });
    });

  const selfTest = () =>
    run('selftest', async () => {
      const result = await vaultService.selfTest();
      setReport(result);
      return result.roundTripOk && result.wrongPasswordRejected && result.tamperRejected
        ? t('settings.selfTestOk')
        : t('settings.selfTestFail');
    });

  const kdf = status.kdf;
  const verdict = (ok: boolean) => (ok ? t('settings.pass') : t('settings.fail'));

  return (
    <div className="panel">
      <div className="panel-title">{t('settings.title')}</div>

      <div className="section">
        <div className="section-title">{t('settings.sectionLanguage')}</div>
        <select
          className="input"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as 'auto' | Locale)}
        >
          <option value="auto">{t('settings.languageAuto')}</option>
          {LOCALES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="hint">{t('settings.languageHint')}</p>
      </div>

      <div className="section">
        <div className="section-title">{t('settings.sectionLock')}</div>
        <select
          className="input"
          value={status.settings.lockAfterMs}
          onChange={(event) => void changeLock(Number(event.target.value))}
        >
          {LOCK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t('settings.lockAfter', { label: t('settings.minutes', { n: option.label }) })}
            </option>
          ))}
        </select>
        <p className="hint">
          {t('settings.kdfHint', {
            m: kdf ? Math.round(kdf.m / 1024) : '?',
            t: kdf?.t ?? '?',
            p: kdf?.p ?? '?',
          })}
        </p>
      </div>

      <div className="section">
        <div className="section-title">{t('settings.sectionClipboard')}</div>
        {clipGranted === false && (
          <>
            <p className="hint">{t('settings.clipDisabled')}</p>
            <button className="btn" onClick={enableClipboard} disabled={busy !== null}>
              {t('settings.clipEnable')}
            </button>
          </>
        )}
        {clipGranted === true && (
          <>
            <select
              className="input"
              value={status.settings.clipboardClearMs}
              onChange={(event) =>
                void run('clip', async () => {
                  await vaultService.setSettings({ clipboardClearMs: Number(event.target.value) });
                  return t('settings.updatedClipboard');
                })
              }
            >
              {CLIP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.kind === 'never'
                    ? t('settings.clipNever')
                    : option.kind === 'seconds'
                      ? t('settings.clipSeconds', { n: option.n })
                      : t('settings.clipMinutes', { n: option.n })}
                </option>
              ))}
            </select>
            <p className="hint">{t('settings.clipboardHint')}</p>
          </>
        )}
      </div>

      <div className="section">
        <div className="section-title">{t('settings.sectionPassword')}</div>
        <input
          className="input"
          type="password"
          placeholder={t('settings.oldPassword')}
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder={t('settings.newPassword')}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder={t('settings.repeatNewPassword')}
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
        />
        <button
          className="btn"
          onClick={changePassword}
          disabled={busy !== null || oldPassword === '' || newPassword === ''}
        >
          {busy === 'password' ? t('settings.changing') : t('settings.change')}
        </button>
      </div>

      <div className="section">
        <div className="section-title">{t('settings.sectionBackup')}</div>
        <button className="btn" onClick={exportBackup} disabled={busy !== null}>
          {busy === 'export' ? t('settings.exporting') : t('settings.export')}
        </button>
        <p className="hint">{t('settings.exportHint')}</p>
        <p className="hint">
          {t('settings.lastExport', { value: formatTime(status.settings.lastBackupAt) })}
        </p>
        {backupNotice && <p className="hint warn">{backupNotice}</p>}

        <div className="inline">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            {backupName || t('settings.chooseBackup')}
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
              placeholder={t('settings.backupPassword')}
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
            />
            <button className="btn" onClick={restoreBackup} disabled={busy !== null || backupPassword === ''}>
              {busy === 'restore' ? t('settings.restoring') : t('settings.restore')}
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">{t('settings.sectionSelfTest')}</div>
        <button className="btn" onClick={selfTest} disabled={busy !== null}>
          {busy === 'selftest' ? t('settings.running') : t('settings.runSelfTest')}
        </button>
        {report && (
          <div className="report">
            <div>{t('settings.reportHead', { ms: report.deriveMs, bytes: report.ciphertextBytes })}</div>
            <div>{t('settings.reportRoundTrip', { value: verdict(report.roundTripOk) })}</div>
            <div>{t('settings.reportWrongPassword', { value: verdict(report.wrongPasswordRejected) })}</div>
            <div>{t('settings.reportTamper', { value: verdict(report.tamperRejected) })}</div>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {message && <div className="ok">{message}</div>}

      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
