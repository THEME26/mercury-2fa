import { useCallback, useEffect, useState } from 'react';
import { acknowledgeDevMode, deleteEntry, isDevAcknowledged, listEntries } from '../../lib/store';
import { steamTotp, totp } from '../../lib/totp';
import type { OtpEntry } from '../../lib/types';
import AddForm from './AddForm';

interface CodeState {
  code: string;
  expiresAt: number;
  period: number;
}

function groupCode(code: string): string {
  if (/^\d+$/.test(code) && code.length >= 6 && code.length % 2 === 0) {
    const half = code.length / 2;
    return `${code.slice(0, half)} ${code.slice(half)}`;
  }
  return code;
}

export default function App() {
  const [entries, setEntries] = useState<OtpEntry[]>([]);
  const [codes, setCodes] = useState<Record<string, CodeState>>({});
  const [now, setNow] = useState(() => Date.now());
  const [refreshToken, setRefreshToken] = useState(0);
  const [screen, setScreen] = useState<'list' | 'add'>('list');
  const [acked, setAcked] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setEntries(await listEntries());
  }, []);

  useEffect(() => {
    void reload();
    void isDevAcknowledged().then(setAcked);
  }, [reload]);

  useEffect(() => {
    if (entries.length === 0) {
      setCodes({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, CodeState> = {};
      for (const entry of entries) {
        const result =
          entry.type === 'steam'
            ? await steamTotp(entry.secret)
            : await totp({
                secret: entry.secret,
                period: entry.period,
                digits: entry.digits,
                algorithm: entry.algorithm,
              });
        next[entry.id] = { code: result.code, expiresAt: result.expiresAt, period: result.period };
      }
      if (!cancelled) setCodes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, refreshToken]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      const expiries = Object.values(codes).map((item) => item.expiresAt);
      if (expiries.length > 0 && Math.min(...expiries) <= current) {
        setRefreshToken((token) => token + 1);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [codes]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (pendingDelete === null) return;
    const timer = window.setTimeout(() => setPendingDelete(null), 3000);
    return () => window.clearTimeout(timer);
  }, [pendingDelete]);

  const copy = async (id: string) => {
    const state = codes[id];
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setToast('已复制，可粘贴到验证页');
    } catch {
      setToast('复制失败，请检查剪贴板权限');
    }
  };

  const remove = async (id: string) => {
    await deleteEntry(id);
    setPendingDelete(null);
    await reload();
    setToast('已删除');
  };

  if (acked === null) return <div className="boot">加载中…</div>;

  if (!acked) {
    return (
      <div className="notice">
        <div className="notice-title">v0.1 存储尚未加密</div>
        <p>本版把种子以明文写入 chrome.storage.local，仅适合本机自测。任何能读取浏览器配置目录的程序都能拿到它。</p>
        <p>验收目标是 TOTP 内核正确性。Argon2id 主密码加密排在 v0.2，接上之后才会写盘加密。</p>
        <button
          className="btn primary wide"
          onClick={async () => {
            await acknowledgeDevMode();
            setAcked(true);
          }}
        >
          我已了解，继续使用开发版
        </button>
      </div>
    );
  }

  if (screen === 'add') {
    return (
      <AddForm
        onCancel={() => setScreen('list')}
        onAdded={async () => {
          await reload();
          setScreen('list');
          setRefreshToken((token) => token + 1);
          setToast('已添加');
        }}
      />
    );
  }

  const filtered = entries.filter((entry) => {
    if (query.trim() === '') return true;
    const haystack = `${entry.issuer} ${entry.account}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="shell">
      <header className="bar">
        <div className="brand">
          <span className="dot" />
          Mercury 2FA
          <span className="count">{entries.length}</span>
        </div>
        <div className="bar-actions">
          {entries.length > 0 && (
            <button className="link" onClick={() => setEditing((value) => !value)}>
              {editing ? '完成' : '编辑'}
            </button>
          )}
          <button className="icon-btn" title="添加条目" onClick={() => setScreen('add')}>
            ＋
          </button>
        </div>
      </header>

      {entries.length > 3 && (
        <input
          className="search"
          placeholder="搜索发行方或账号"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      <main className="list">
        {entries.length === 0 && (
          <div className="empty">
            <div className="empty-title">还没有条目</div>
            <p>点右上角 ＋，粘贴 otpauth 链接或手填种子。</p>
          </div>
        )}

        {filtered.map((entry) => {
          const state = codes[entry.id];
          const remainingMs = state ? Math.max(0, state.expiresAt - now) : 0;
          const periodMs = (state?.period ?? 30) * 1000;
          const progress = state ? Math.max(0, Math.min(1, remainingMs / periodMs)) : 0;
          const expiring = state !== undefined && remainingMs <= 5000;

          return (
            <div
              key={entry.id}
              className="row"
              role="button"
              tabIndex={0}
              onClick={() => void copy(entry.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void copy(entry.id);
              }}
            >
              <div className="row-main">
                <div className="row-title">{entry.issuer || '未命名'}</div>
                <div className="row-sub">
                  {entry.account || '—'}
                  {entry.type !== 'totp' && <span className="tag">{entry.type.toUpperCase()}</span>}
                </div>
              </div>
              <div className={expiring ? 'row-code expiring' : 'row-code'}>
                {state ? groupCode(state.code) : '··· ···'}
              </div>
              {editing && (
                <button
                  className={pendingDelete === entry.id ? 'remove confirm' : 'remove'}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (pendingDelete === entry.id) void remove(entry.id);
                    else setPendingDelete(entry.id);
                  }}
                >
                  {pendingDelete === entry.id ? '确认' : '×'}
                </button>
              )}
              <div className="progress">
                <span style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          );
        })}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
