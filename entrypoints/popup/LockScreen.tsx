import { useState } from 'react';
import { describeError } from '../../lib/i18n/describe-error';
import { useI18n } from '../../lib/i18n/react';
import { vaultService } from '../../lib/remote-client';
import { KDF_TIERS, type KdfTier, type VaultStatus } from '../../lib/types';

interface Props {
  status: VaultStatus;
  onDone: () => Promise<void>;
}

export default function LockScreen({ status, onDone }: Props) {
  const { t } = useI18n();
  const creating = status.state === 'empty';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tier, setTier] = useState<KdfTier>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (creating && password !== confirm) {
      setError(t('lock.mismatch'));
      return;
    }
    setBusy(true);
    try {
      if (creating) await vaultService.create(password, tier);
      else await vaultService.unlock(password);
      setPassword('');
      await onDone();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <div className="lock-mark" aria-hidden="true">
        <svg viewBox="0 0 34 34" width="34" height="34">
          <defs>
            <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <rect width="34" height="34" rx="7.5" fill="url(#lm)" />
          <path d="M 21.76 8.76 A 9.52 9.52 0 1 1 12.24 8.76" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="17" cy="17" r="2.04" fill="#fff" />
        </svg>
      </div>
      <div className="lock-title">{creating ? t('lock.createTitle') : t('lock.lockedTitle')}</div>
      <p className="lock-sub">{creating ? t('lock.createSub') : t('lock.lockedSub')}</p>

      {creating && status.hasLegacy && <div className="banner">{t('lock.legacy')}</div>}

      <label className="field">
        <span>{t('lock.password')}</span>
        <input
          className="input"
          type="password"
          autoFocus
          value={password}
          placeholder={creating ? t('lock.passwordPlaceholderNew') : t('lock.passwordPlaceholderUnlock')}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !creating) void submit();
          }}
        />
      </label>

      {creating && (
        <>
          <label className="field">
            <span>{t('lock.repeat')}</span>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          </label>
          <label className="field">
            <span>{t('lock.tier')}</span>
            <select className="input" value={tier} onChange={(event) => setTier(event.target.value as KdfTier)}>
              {(Object.keys(KDF_TIERS) as KdfTier[]).map((key) => (
                <option key={key} value={key}>
                  {t(`lock.tier.${key}`)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {error && <div className="error">{error}</div>}

      <button className="btn primary wide" onClick={submit} disabled={busy || password.length === 0}>
        {busy
          ? creating
            ? t('lock.deriving')
            : t('lock.unlocking')
          : creating
            ? t('lock.create')
            : t('lock.unlock')}
      </button>

      {creating && <div className="hint">{t('lock.tierHint')}</div>}
    </div>
  );
}
