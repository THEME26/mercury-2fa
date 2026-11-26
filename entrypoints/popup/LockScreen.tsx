import { useState } from 'react';
import { toErrorMessage } from '../../lib/errors';
import { vaultService } from '../../lib/service-instance';
import type { KdfTier, VaultStatus } from '../../lib/types';
import { KDF_TIERS } from '../../lib/crypto';

interface Props {
  status: VaultStatus;
  onDone: () => Promise<void>;
}

export default function LockScreen({ status, onDone }: Props) {
  const creating = status.state === 'empty';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tier, setTier] = useState<KdfTier>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (creating && password !== confirm) {
      setError('两次输入的主密码不一致');
      return;
    }
    setBusy(true);
    try {
      if (creating) await vaultService.create(password, tier);
      else await vaultService.unlock(password);
      setPassword('');
      await onDone();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <div className="lock-mark" />
      <div className="lock-title">{creating ? '设置主密码' : '保险库已锁定'}</div>
      <p className="lock-sub">
        {creating
          ? '主密码只在本机用于派生密钥，不上传、不可找回。'
          : '输入主密码解锁，空闲超时会自动锁定。'}
      </p>

      {creating && status.hasLegacy && (
        <div className="banner">
          检测到 v0.1 明文库，创建保险库时会自动加密迁移，原键随后删除。
        </div>
      )}

      <label className="field">
        <span>主密码</span>
        <input
          className="input"
          type="password"
          autoFocus
          value={password}
          placeholder="至少 8 位"
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !creating) void submit();
          }}
        />
      </label>

      {creating && (
        <>
          <label className="field">
            <span>再输一次</span>
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
            <span>派生强度</span>
            <select className="input" value={tier} onChange={(event) => setTier(event.target.value as KdfTier)}>
              {(Object.keys(KDF_TIERS) as KdfTier[]).map((key) => (
                <option key={key} value={key}>
                  {KDF_TIERS[key].label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {error && <div className="error">{error}</div>}

      <button className="btn primary wide" onClick={submit} disabled={busy || password.length === 0}>
        {busy ? (creating ? '正在派生密钥…' : '正在解锁…') : creating ? '创建保险库' : '解锁'}
      </button>

      {creating && <div className="hint">强度越高，每次解锁越慢；换机器可改档，只重封装密钥。</div>}
    </div>
  );
}
