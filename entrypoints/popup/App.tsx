import { useCallback, useEffect, useState } from 'react';
import { scheduleClipboardClear, hasClipboardAccess, shouldScheduleClear } from '../../lib/clipboard';
import { describeError } from '../../lib/i18n/describe-error';
import { useI18n } from '../../lib/i18n/react';
import { getLanguagePreference, applyLanguagePreference } from '../../lib/i18n/preference';
import { fillActivePage, getActivePage, type ActivePage } from '../../lib/fill/inject';
import { bestMatch } from '../../lib/fill/site-match';
import { vaultService } from '../../lib/remote-client';
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
  const { t } = useI18n();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [views, setViews] = useState<EntryView[]>([]);
  const [screen, setScreen] = useState<Screen>('main');
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<ActivePage | null>(null);
  const [filling, setFilling] = useState<string | null>(null);
  const [language, setLanguage] = useState(getLanguagePreference());

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
      setFatal(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    void getActivePage().then(setPage);
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

  /** 「30 秒后清空」这类提示由语言决定词序，交给词条拼 */
  const clearLabel = (ms: number): string =>
    ms % 60_000 === 0
      ? t('clipboard.clearIn', { n: t('clipboard.minutes', { n: ms / 60_000 }) })
      : t('clipboard.clearIn', { n: t('clipboard.seconds', { n: Math.round(ms / 1000) }) });

  const copy = async (view: EntryView) => {
    try {
      await navigator.clipboard.writeText(view.code);
      const clearMs = status?.settings.clipboardClearMs ?? 0;
      /** 清空要跑在无焦点的 offscreen 里，只有拿到 clipboardWrite 才做得到 */
      const scheduled = shouldScheduleClear(clearMs, clearMs > 0 && (await hasClipboardAccess()));
      if (scheduled) await scheduleClipboardClear(clearMs);
      const delay = scheduled ? clearLabel(clearMs) : '';
      if (view.type === 'hotp') {
        await vaultService.bumpCounter(view.id);
        await refresh();
        flash(delay === '' ? t('main.copiedHotp') : t('main.copiedHotpClearing', { delay }));
        return;
      }
      flash(delay === '' ? t('main.copied') : t('main.copiedClearing', { delay }));
    } catch (cause) {
      flash(describeError(cause));
    }
  };

  const togglePin = async (id: string) => {
    await vaultService.togglePin(id);
    await refresh();
  };

  /** 填入前重新取码：列表里的 code 可能刚跨过 30 秒窗口 */
  const fill = async (view: EntryView) => {
    setFilling(view.id);
    try {
      const fresh = (await vaultService.listCodes()).find((entry) => entry.id === view.id) ?? view;
      const report = await fillActivePage(fresh.code, fresh.digits, fresh.issuer);
      if (report.ok && fresh.type === 'hotp') {
        await vaultService.bumpCounter(fresh.id);
        await refresh();
      }
      flash(t(report.key, report.params));
      if (report.ok) window.setTimeout(() => window.close(), 700);
    } catch (cause) {
      flash(describeError(cause));
    } finally {
      setFilling(null);
    }
  };

  const remove = async (id: string) => {
    await vaultService.remove(id);
    setPendingDelete(null);
    await refresh();
    flash(t('main.deleted'));
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
        <div className="lock-title">{t('main.errorTitle')}</div>
        <p className="lock-sub">{fatal}</p>
        <button className="btn" onClick={() => void refresh()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (status === null) return <div className="boot">{t('common.loading')}</div>;

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
          flash(t('main.added'));
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
        language={language}
        onLanguageChange={(preference) => {
          setLanguage(preference);
          void applyLanguagePreference(preference);
        }}
        onChanged={refresh}
        onClose={() => setScreen('main')}
      />
    );
  }

  const filtered = views.filter((view) => {
    if (query.trim() === '') return true;
    return `${view.issuer} ${view.account}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  const injectable = page !== null && page.host !== '';
  const autoTarget = injectable ? bestMatch(page.host, views) : null;

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
            {editing ? t('main.done') : t('main.edit')}
          </button>
          <button className="link" onClick={() => setScreen('settings')}>
            {t('main.settings')}
          </button>
          <button className="icon-btn" title={t('main.add')} onClick={() => setScreen('add')}>
            ＋
          </button>
        </div>
      </header>

      {views.length > 3 && (
        <input
          className="search"
          placeholder={t('main.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      <main className="list">
        {views.length === 0 && (
          <div className="empty">
            <div className="empty-title">{t('main.emptyTitle')}</div>
            <p>{t('main.emptyBody')}</p>
          </div>
        )}

        {filtered.map((view) => {
          const remainingMs = view.expiresAt > 0 ? Math.max(0, view.expiresAt - now) : 0;
          const periodMs = view.period * 1000;
          const progress = view.expiresAt > 0 ? Math.max(0, Math.min(1, remainingMs / periodMs)) : 0;
          const expiring = view.expiresAt > 0 && remainingMs <= 5000;
          /** 只标与默认值不同的参数：SHA-1 / 6 位 / 30 秒不占位置 */
          const spec = [
            view.type === 'totp' && view.algorithm !== 'SHA-1' ? view.algorithm : null,
            view.type !== 'steam' && view.digits !== 6 ? t('main.digits', { n: view.digits }) : null,
            view.type === 'totp' && view.period !== 30 ? t('main.period', { n: view.period }) : null,
          ]
            .filter((part): part is string => part !== null)
            .join(' · ');

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
                title={view.pinned ? t('main.unpin') : t('main.pin')}
                onClick={(event) => {
                  event.stopPropagation();
                  void togglePin(view.id);
                }}
              >
                ★
              </button>
              <div className="row-main">
                <div className="row-title">{view.issuer || t('common.unnamed')}</div>
                <div className="row-sub">
                  <span className="acct">{view.account || t('common.none')}</span>
                  {view.type !== 'totp' && <span className="tag">{view.type.toUpperCase()}</span>}
                  {view.type === 'hotp' && <span className="tag">#{view.step}</span>}
                  {spec !== '' && (
                    <span className="tag" title={t('main.specHint')}>
                      {spec}
                    </span>
                  )}
                  {view.sharedSecret && (
                    <span className="tag warn" title={t('main.sharedHint')}>
                      {t('main.shared')}
                    </span>
                  )}
                </div>
              </div>
              <div className={expiring ? 'row-code expiring' : 'row-code'}>
                {remainingMs > 0 || view.expiresAt === 0 ? groupCode(view.code) : t('main.codeHidden')}
              </div>
              {injectable && (
                <button
                  className="row-fill"
                  title={t('main.fillTitle')}
                  disabled={filling === view.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void fill(view);
                  }}
                >
                  {filling === view.id ? '·' : '↵'}
                </button>
              )}
              {editing && (
                <button
                  className={pendingDelete === view.id ? 'remove confirm' : 'remove'}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (pendingDelete === view.id) void remove(view.id);
                    else setPendingDelete(view.id);
                  }}
                >
                  {pendingDelete === view.id ? t('common.confirm') : '×'}
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
        {autoTarget && (
          <>
            <button className="link strong" disabled={filling !== null} onClick={() => void fill(autoTarget)}>
              {t('main.fillTarget', { name: autoTarget.issuer || t('main.fillCurrent') })}
            </button>
            <span className="foot-sep">·</span>
          </>
        )}
        <button className="link" onClick={() => setScreen('import')}>
          {t('main.import')}
        </button>
        <span className="foot-sep">·</span>
        <button className="link" onClick={() => void lock()}>
          {t('main.lockNow')}
        </button>
        <span className="foot-note">{t('main.autoLock', { n: status.settings.lockAfterMs / 60000 })}</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
