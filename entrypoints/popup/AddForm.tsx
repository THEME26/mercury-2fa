import { useState } from 'react';
import { isOtpAuthUri, parseOtpAuthUri } from '../../lib/otpauth';
import { addEntry } from '../../lib/store';
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
      setError((cause as Error).message);
    }
  };

  const submit = async () => {
    setError(null);
    if (!form.secret.trim()) {
      setError('种子不能为空');
      return;
    }
    setBusy(true);
    try {
      await addEntry({
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
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">添加条目</div>

      <label className="field">
        <span>粘贴 otpauth 链接（可留空）</span>
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
          <span>类型</span>
          <select
            className="input"
            value={form.type}
            onChange={(event) => patch({ type: event.target.value as OtpType })}
          >
            <option value="totp">TOTP（按时间）</option>
            <option value="hotp">HOTP（按次数）</option>
            <option value="steam">Steam</option>
          </select>
        </label>
        <label className="field">
          <span>发行方</span>
          <input
            className="input"
            value={form.issuer}
            placeholder="GitHub"
            onChange={(event) => patch({ issuer: event.target.value })}
          />
        </label>
      </div>

      <label className="field">
        <span>账号</span>
        <input
          className="input"
          value={form.account}
          placeholder="alice@example.com"
          onChange={(event) => patch({ account: event.target.value })}
        />
      </label>

      <label className="field">
        <span>种子（Base32）</span>
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
            <span>位数</span>
            <input
              className="input"
              type="number"
              value={form.digits}
              onChange={(event) => patch({ digits: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{form.type === 'hotp' ? '计数器' : '周期(秒)'}</span>
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
            <span>算法</span>
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

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="btn primary" type="button" onClick={submit} disabled={busy}>
          {busy ? '保存中' : '保存'}
        </button>
      </div>
    </div>
  );
}
