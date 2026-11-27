import { useState } from 'react';
import { describeError } from '../../lib/i18n/describe-error';
import { useI18n } from '../../lib/i18n/react';
import { isOtpAuthUri, parseOtpAuthUri } from '../../lib/otpauth';
import { vaultService } from '../../lib/remote-client';
import type { HmacAlgorithm, OtpType } from '../../lib/types';

interface FormState {
  type: OtpType;
  issuer: string;
  account: string;
  secret: string;
  algorithm: HmacAlgorithm;
  digits: number;
  period: number;
  counter: number;
}

const INITIAL: FormState = {
  type: 'totp',
  issuer: '',
  account: '',
  secret: '',
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
  counter: 0,
};

export default function AddForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  const handleLink = (text: string) => {
    setLink(text);
    if (!isOtpAuthUri(text)) return;
    try {
      const parsed = parseOtpAuthUri(text);
      setForm({
        type: parsed.type,
        issuer: parsed.issuer,
        account: parsed.account,
        secret: parsed.secret,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        counter: parsed.counter ?? 0,
      });
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  const submit = async () => {
    setError(null);
    if (!form.secret.trim()) {
      setError(t('add.secretRequired'));
      return;
    }
    setBusy(true);
    try {
      await vaultService.add({
        manual: {
          type: form.type,
          issuer: form.issuer,
          account: form.account,
          secret: form.secret,
          algorithm: form.algorithm,
          digits: form.digits,
          period: form.period,
          counter: form.counter,
        },
      });
      onAdded();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">{t('add.title')}</div>

      <label className="field">
        <span>{t('add.link')}</span>
        <input
          className="input"
          value={link}
          placeholder="otpauth://totp/..."
          onChange={(event) => handleLink(event.target.value)}
        />
      </label>

      <div className="divider" />

      <div className="grid2">
        <label className="field">
          <span>{t('add.type')}</span>
          <select
            className="input"
            value={form.type}
            onChange={(event) => patch({ type: event.target.value as OtpType })}
          >
            <option value="totp">{t('add.type.totp')}</option>
            <option value="hotp">{t('add.type.hotp')}</option>
            <option value="steam">{t('add.type.steam')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('add.issuer')}</span>
          <input
            className="input"
            value={form.issuer}
            placeholder="GitHub"
            onChange={(event) => patch({ issuer: event.target.value })}
          />
        </label>
      </div>

      <label className="field">
        <span>{t('add.account')}</span>
        <input
          className="input"
          value={form.account}
          placeholder="alice@example.com"
          onChange={(event) => patch({ account: event.target.value })}
        />
      </label>

      <label className="field">
        <span>{t('add.secret')}</span>
        <input
          className="input mono"
          value={form.secret}
          placeholder="JBSWY3DPEHPK3PXP"
          onChange={(event) => patch({ secret: event.target.value })}
        />
      </label>

      {form.type !== 'steam' && (
        <div className="grid3">
          <label className="field">
            <span>{t('add.digits')}</span>
            <input
              className="input"
              type="number"
              value={form.digits}
              onChange={(event) => patch({ digits: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{form.type === 'hotp' ? t('add.counter') : t('add.period')}</span>
            <input
              className="input"
              type="number"
              value={form.type === 'hotp' ? form.counter : form.period}
              onChange={(event) =>
                patch(
                  form.type === 'hotp'
                    ? { counter: Number(event.target.value) }
                    : { period: Number(event.target.value) },
                )
              }
            />
          </label>
          <label className="field">
            <span>{t('add.algorithm')}</span>
            <select
              className="input"
              value={form.algorithm}
              onChange={(event) => patch({ algorithm: event.target.value as HmacAlgorithm })}
            >
              <option value="SHA-1">SHA-1</option>
              <option value="SHA-256">SHA-256</option>
              <option value="SHA-512">SHA-512</option>
            </select>
          </label>
        </div>
      )}

      {form.type !== 'steam' && <p className="hint">{t('add.hint')}</p>}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn primary" type="button" onClick={submit} disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
