import { useRef, useState } from 'react';
import { toErrorMessage } from '../../lib/errors';
import { parseImportText, type ImportResult } from '../../lib/importers';
import { pickOtpText, scanActiveTab } from '../../lib/qr-scan';
import { vaultService } from '../../lib/remote-client';

interface Props {
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}

export default function ImportPanel({ onDone, onCancel }: Props) {
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
      setError(toErrorMessage(cause));
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
        throw new Error(texts.length === 0 ? '当前页没有识别到二维码' : '识别到的二维码不是验证码配置');
      }
      setText(otp);
      setPreview(parseImportText(otp));
    } catch (cause) {
      setError(toErrorMessage(cause));
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
    await onDone(`导入 ${added} 条${failed > 0 ? `，${failed} 条已存在或无效` : ''}`);
  };

  return (
    <div className="panel">
      <div className="panel-title">导入</div>
      <p className="hint">支持 Google Authenticator 迁移码、Aegis、2FAS、andOTP、Bitwarden，以及 otpauth 链接。</p>

      <button className="btn ghost" onClick={() => void scan()} disabled={scanning}>
        {scanning ? '识别中…' : '扫描当前页二维码'}
      </button>
      <p className="hint">
        截图在本地识别，图片不出本机。页面里有多个二维码时，取第一个能读懂的验证码配置。
      </p>

      <label className="field">
        <span>粘贴内容</span>
        <textarea
          className="input area"
          rows={5}
          value={text}
          placeholder="otpauth-migration://offline?data=… 或 JSON 备份内容"
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
          }}
        />
      </label>

      <div className="inline">
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          选择文件
        </button>
        <button className="btn" onClick={parse} disabled={text.trim() === ''}>
          解析
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
            {preview.source} · 识别 {preview.entries.length} 条
            {preview.skipped > 0 ? ` · 跳过 ${preview.skipped} 条` : ''}
          </div>
          <div className="preview-list">
            {preview.entries.slice(0, 12).map((entry, index) => (
              <div className="preview-row" key={`${entry.issuer}-${entry.account}-${index}`}>
                <span className="preview-issuer">{entry.issuer || '未命名'}</span>
                <span className="preview-account">{entry.account || '—'}</span>
                <span className="preview-meta">
                  {entry.type.toUpperCase()} · {entry.digits}位
                </span>
              </div>
            ))}
            {preview.entries.length > 12 && <div className="hint">还有 {preview.entries.length - 12} 条未显示</div>}
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn ghost" onClick={onCancel}>
          返回
        </button>
        <button className="btn primary" onClick={apply} disabled={!preview || busy}>
          {busy ? '导入中…' : preview ? `导入 ${preview.entries.length} 条` : '先解析'}
        </button>
      </div>
    </div>
  );
}
