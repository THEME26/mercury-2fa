import { browser } from 'wxt/browser';
import { localStore, sessionStore } from '../lib/browser-store';
import {
  errorReply,
  isReply,
  normalizeCommand,
  okReply,
  type VaultCommand,
  type VaultReply,
} from '../lib/protocol';
import { parseStoreRequest } from '../lib/store-bridge';
import { backupBadgeText } from '../lib/badge';
import { CLIPBOARD_ALARM } from '../lib/clipboard';
import type { Settings } from '../lib/types';

const OFFSCREEN_PATH = 'offscreen.html';

const BADGE_ALARM = 'mc.badge';
const BADGE_COLOR = '#B45309';
/** 这两处写入会影响角标：库体（条数）与设置（上次导出时间） */
const BADGE_KEYS = new Set(['vault.v2', 'settings.v1']);

interface OffscreenApi {
  hasDocument(): Promise<boolean>;
  createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
  closeDocument(): Promise<void>;
}

function offscreenApi(): OffscreenApi | undefined {
  return (globalThis as { chrome?: { offscreen?: OffscreenApi } }).chrome?.offscreen;
}

export default defineBackground(() => {
  let creating: Promise<void> | null = null;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** createDocument 返回时脚本未必已经挂上监听，用 ping 探到响应为止 */
  async function waitReady(): Promise<void> {
    for (let i = 0; i < 40; i++) {
      try {
        const reply = await browser.runtime.sendMessage({ target: 'offscreen', op: 'ping' });
        if (isReply(reply) && reply.ok) return;
      } catch {
        /* 还没挂上监听，继续等 */
      }
      await sleep(50);
    }
    throw new Error('加密进程未就绪，请重试');
  }

  async function ensureOffscreen(): Promise<void> {
    const api = offscreenApi();
    if (!api) throw new Error('当前浏览器不支持 offscreen 文档，需要 Chrome 116 以上');
    if (await api.hasDocument()) return;
    if (creating === null) {
      creating = api
        .createDocument({
          url: OFFSCREEN_PATH,
          reasons: ['CLIPBOARD'],
          justification: '在后台完成保险库加解密，并在验证码复制超时后覆写剪贴板',
        })
        .finally(() => {
          creating = null;
        });
    }
    await creating;
    await waitReady();
  }

  async function closeOffscreen(): Promise<void> {
    const api = offscreenApi();
    if (!api) return;
    if (await api.hasDocument()) await api.closeDocument();
  }

  async function forward(command: VaultCommand): Promise<VaultReply> {
    await ensureOffscreen();
    const reply = await browser.runtime.sendMessage({ target: 'offscreen', ...command });
    if (!isReply(reply)) throw new Error('加密进程没有返回结果');
    return reply;
  }

  /** 备份健康度：超过 30 天没导出，或者从来没导出过，就在图标上挂个角标 */
  async function refreshBadge(): Promise<void> {
    const vault = await localStore.get<{ entryCount?: number }>('vault.v2');
    const settings = (await localStore.get<Partial<Settings>>('settings.v1')) ?? {};
    const text = backupBadgeText(vault?.entryCount ?? 0, settings.lastBackupAt, Date.now());
    await browser.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await browser.action.setBadgeText({ text });
  }

  /**
   * 保险库与设置在 offscreen 里写，写完整批才生效，所以刷新合并到一次。
   * 没有这一层时，角标只在 12 小时闹钟、浏览器启动或扩展更新时重算，
   * 加完条目仍不显示，导出备份后又要挂满 12 小时。
   */
  let badgeTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleBadgeRefresh(): void {
    if (badgeTimer !== null) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      badgeTimer = null;
      void refreshBadge();
    }, 300);
  }

  /**
   * offscreen 的存储代理。offscreen 不保证有 chrome.storage，保险库读写都走这条通道。
   * 只接受 offscreen.html 发来的请求，popup 不能借这里改写密文。
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    if (!sender.url || !sender.url.endsWith(`/${OFFSCREEN_PATH}`)) return false;
    const request = parseStoreRequest(message);
    if (request === null) return false;

    void (async () => {
      try {
        const area = request.kind === 'session' ? sessionStore : localStore;
        if (request.op === 'get') {
          sendResponse(okReply(await area.get(request.key)));
          return;
        }
        if (request.op === 'set') {
          await area.set(request.key, request.value);
        } else {
          await area.remove(request.key);
        }
        if (request.kind === 'local' && BADGE_KEYS.has(request.key)) scheduleBadgeRefresh();
        sendResponse(okReply(true));
      } catch (cause) {
        sendResponse(errorReply(cause));
      }
    })();
    return true;
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    const command = normalizeCommand(message, 'vault');
    if (command === null) return false;

    void (async () => {
      try {
        const reply = await forward(command);
        if (command.op === 'lock') await closeOffscreen();
        sendResponse(reply);
      } catch (cause) {
        sendResponse(errorReply(cause));
      }
    })();
    return true;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLIPBOARD_ALARM) {
      void (async () => {
        try {
          await forward({ op: 'clipboardClear' });
        } catch {
          /** 清不掉就放弃，不在下次打开时盲目覆写用户可能已复制的其他内容 */
        }
        await browser.alarms.clear(CLIPBOARD_ALARM);
      })();
      return;
    }
    if (alarm.name === BADGE_ALARM) void refreshBadge();
  });

  /** 系统空闲或锁屏时立刻丢弃 DEK，并把 offscreen 一起关掉 */
  browser.idle.onStateChanged.addListener((state) => {
    if (state !== 'idle' && state !== 'locked') return;
    void (async () => {
      try {
        await forward({ op: 'lock' });
      } catch {
        /* 没解锁时不需要锁 */
      }
      await closeOffscreen();
    })();
  });

  browser.runtime.onInstalled.addListener((details) => {
    console.info(`[mercury-2fa] ${details.reason} v${browser.runtime.getManifest().version}`);
    void browser.alarms.create(BADGE_ALARM, { periodInMinutes: 60 * 12 });
    void refreshBadge();
  });

  browser.runtime.onStartup.addListener(() => {
    void refreshBadge();
  });

  void browser.alarms.create(BADGE_ALARM, { periodInMinutes: 60 * 12 });
  void refreshBadge();
});
