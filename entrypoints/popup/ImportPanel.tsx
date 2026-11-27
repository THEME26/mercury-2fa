import { useRef, useState } from 'react';
import { UserError } from '../../lib/errors';
import { describeError } from '../../lib/i18n/describe-error';
import { useI18n } from '../../lib/i18n/react';
import { parseImportText, type ImportResult } from '../../lib/importers';
import { pickOtpText, scanActiveTab } from '../../lib/qr-scan';
import { vaultService } from '../../lib/remote-client';

interface Props {
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}

export default function ImportPanel({ onDone, onCancel }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = () => {
    setError(null);
    setPreview(null);
    try {
      setPreview(parseImportText(text));
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    setError(null);
    setPreview(null);
  };

  /** 截当前页再识别。首次点击会加载约 1.2MB 的 wasm，所以只在用户主动点时才拉 */
  const scan = async () => {
    setScanning(true);
    setError(null);
    setPreview(null);
    try {
      const texts = await scanActiveTab();
      const otp = pickOtpText(texts);
      if (otp === null) {
        throw new UserError(texts.length === 0 ? 'error.qr.none' : 'error.qr.notOtp');
      }
      setText(otp);
      setPreview(parseImportText(otp));
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    let added = 0;
    let failed = 0;
    for (const entry of preview.entries) {
      try {
        await vaultService.add({
          manual: {
            type: entry.type,
            issuer: entry.issuer,
            account: entry.account,
            secret: entry.secret,
            algorithm: entry.algorithm,
            digits: entry.digits,
            period: entry.period,
            counter: entry.counter,
          },
        });
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    await onDone(
      failed > 0 ? t('import.resultSkipped', { n: added, m: failed }) : t('import.result', { n: added }),
    );
  };

  return (
    <div className="panel">
      <div className="panel-title">{t('import.title')}</div>
      <p className="hint">{t('import.formats')}</p>

      <button className="btn ghost" onClick={() => void scan()} disabled={scanning}>
        {scanning ? t('import.scanning') : t('import.scan')}
      </button>
      <p className="hint">{t('import.scanHint')}</p>

      <label className="field">
        <span>{t('import.paste')}</span>
        <textarea
          className="input area"
          rows={5}
          value={text}
          placeholder={t('import.placeholder')}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
          }}
        />
      </label>

      <div className="inline">
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          {t('import.chooseFile')}
        </button>
        <button className="btn" onClick={parse} disabled={text.trim() === ''}>
          {t('import.parse')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          hidden
          onChange={(event) => void loadFile(event.target.files?.[0])}
        />
      </div>

      {error && <div className="error">{error}</div>}

      {preview && (
        <div className="preview">
          <div className="preview-head">
            {t('import.previewHead', {
              source: preview.sourceKey ? t(preview.sourceKey) : preview.source,
              n: preview.entries.length,
            })}
            {preview.skipped > 0 ? t('import.previewSkipped', { n: preview.skipped }) : ''}
          </div>
          <div className="preview-list">
            {preview.entries.slice(0, 12).map((entry, index) => (
              <div className="preview-row" key={`${entry.issuer}-${entry.account}-${index}`}>
                <span className="preview-issuer">{entry.issuer || t('common.unnamed')}</span>
                <span className="preview-account">{entry.account || t('common.none')}</span>
                <span className="preview-meta">
                  {t('import.previewMeta', { type: entry.type.toUpperCase(), n: entry.digits })}
                </span>
              </div>
            ))}
            {preview.entries.length > 12 && (
              <div className="hint">{t('import.more', { n: preview.entries.length - 12 })}</div>
            )}
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn ghost" onClick={onCancel}>
          {t('common.back')}
        </button>
        <button className="btn primary" onClick={apply} disabled={!preview || busy}>
          {busy
            ? t('import.applying')
            : preview
              ? t('import.apply', { n: preview.entries.length })
              : t('import.applyIdle')}
        </button>
      </div>
    </div>
  );
}
