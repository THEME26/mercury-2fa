import { useCallback, useEffect, useState } from 'react';
import { toErrorMessage } from '../../lib/errors';
import { vaultService } from '../../lib/service-instance';
import type { EntryView, VaultStatus } from '../../lib/types';
import AddForm from './AddForm';
import ImportPanel from './ImportPanel';
import LockScreen from './LockScreen';
import SettingsPanel from './SettingsPanel';

type Screen = 'main' | 'add' | 'import' | 'settings';

function groupCode(code: string): string {
  if (/^\d+$/.test(code) && code.length >= 6 && code.length % 2 === 0) {
    const half = code.length / 2;
    return `${code.slice(0, half)} ${code.slice(half)}`;
  }
  return code;
}

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [views, setViews] = useState<EntryView[]>([]);
  const [screen, setScreen] = useState<Screen>('main');
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await vaultService.status();
      setStatus(next);
      if (next.state === 'unlocked') {
        setViews(await vaultService.listCodes());
        setFatal(null);
      } else {
        setViews([]);
      }
    } catch (cause) {
      setFatal(toErrorMessage(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      const expiries = views.filter((view) => view.expiresAt > 0).map((view) => view.expiresAt);
      if (expiries.length > 0 && Math.min(...expiries) <= current) {
        void vaultService
          .listCodes()
          .then(setViews)
          .catch(() => void refresh());
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [views, refresh]);

  useEffect(() => {
    if (pendingDelete === null) return;
    const timer = window.setTimeout(() => setPendingDelete(null), 3000);
    return () => window.clearTimeout(timer);
  }, [pendingDelete]);

  const copy = async (view: EntryView) => {
    try {
      await navigator.clipboard.writeText(view.code);
      if (view.type === 'hotp') {
        await vaultService.bumpCounter(view.id);
        await refresh();
        flash('已复制，计数器已递增');
        return;
      }
      flash('已复制');
    } catch (cause) {
      flash(toErrorMessage(cause));
    }
  };

  const togglePin = async (id: string) => {
    await vaultService.togglePin(id);
    await refresh();
  };

  const remove = async (id: string) => {
    await vaultService.remove(id);
    setPendingDelete(null);
    await refresh();
    flash('已删除');
  };

  const lock = async () => {
    await vaultService.lock();
    setScreen('main');
    setEditing(false);
    await refresh();
  };

  if (fatal !== null) {
    return (
      <div className="lock">
        <div className="lock-title">出错了</div>
        <p className="lock-sub">{fatal}</p>
        <button className="btn" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  }

  if (status === null) return <div className="boot">加载中…</div>;

  if (status.state !== 'unlocked') {
    return (
      <>
        <LockScreen status={status} onDone={refresh} />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  if (screen === 'add') {
    return (
      <AddForm
        onCancel={() => setScreen('main')}
        onAdded={async () => {
          await refresh();
          setScreen('main');
          flash('已添加');
        }}
      />
    );
  }

  if (screen === 'import') {
    return (
      <ImportPanel
        onCancel={() => setScreen('main')}
        onDone={async (message) => {
          await refresh();
          setScreen('main');
          flash(message);
        }}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsPanel
        status={status}
        onChanged={refresh}
        onClose={() => setScreen('main')}
      />
    );
  }

  const filtered = views.filter((view) => {
    if (query.trim() === '') return true;
    return `${view.issuer} ${view.account}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="shell">
      <header className="bar">
        <div className="brand">
          <span className="dot" />
          Mercury 2FA
          <span className="count">{views.length}</span>
        </div>
        <div className="bar-actions">
          <button className="link" onClick={() => setEditing((value) => !value)}>
            {editing ? '完成' : '编辑'}
          </button>
          <button className="link" onClick={() => setScreen('settings')}>
            设置
          </button>
          <button className="icon-btn" title="添加条目" onClick={() => setScreen('add')}>
            ＋
          </button>
        </div>
      </header>

      {views.length > 3 && (
        <input
          className="search"
          placeholder="搜索发行方或账号"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      <main className="list">
        {views.length === 0 && (
          <div className="empty">
            <div className="empty-title">保险库是空的</div>
            <p>点右上角 ＋ 手填种子，或到「设置」里导入备份。</p>
          </div>
        )}

        {filtered.map((view) => {
          const remainingMs = view.expiresAt > 0 ? Math.max(0, view.expiresAt - now) : 0;
          const periodMs = view.period * 1000;
          const progress = view.expiresAt > 0 ? Math.max(0, Math.min(1, remainingMs / periodMs)) : 0;
          const expiring = view.expiresAt > 0 && remainingMs <= 5000;

          return (
            <div
              key={view.id}
              className="row"
              role="button"
              tabIndex={0}
              onClick={() => void copy(view)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void copy(view);
              }}
            >
              <button
                className={view.pinned ? 'pin active' : 'pin'}
                title={view.pinned ? '取消置顶' : '置顶'}
                onClick={(event) => {
                  event.stopPropagation();
                  void togglePin(view.id);
                }}
              >
                ★
              </button>
              <div className="row-main">
                <div className="row-title">{view.issuer || '未命名'}</div>
                <div className="row-sub">
                  {view.account || '—'}
                  {view.type !== 'totp' && <span className="tag">{view.type.toUpperCase()}</span>}
                  {view.type === 'hotp' && <span className="tag">#{view.step}</span>}
                </div>
              </div>
              <div className={expiring ? 'row-code expiring' : 'row-code'}>
                {remainingMs > 0 || view.expiresAt === 0 ? groupCode(view.code) : '· · ·  · · ·'}
              </div>
              {editing && (
                <button
                  className={pendingDelete === view.id ? 'remove confirm' : 'remove'}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (pendingDelete === view.id) void remove(view.id);
                    else setPendingDelete(view.id);
                  }}
                >
                  {pendingDelete === view.id ? '确认' : '×'}
                </button>
              )}
              {view.expiresAt > 0 && (
                <div className="progress">
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </main>

      <footer className="foot">
        <button className="link" onClick={() => setScreen('import')}>
          导入
        </button>
        <span className="foot-sep">·</span>
        <button className="link" onClick={() => void lock()}>
          立即锁定
        </button>
        <span className="foot-note">
          {status.settings.lockAfterMs / 60000} 分钟自动锁定
        </span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
