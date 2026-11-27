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
import { CLIPBOARD_ALARM } from '../lib/clipboard';

const OFFSCREEN_PATH = 'offscreen.html';

/** 0.8.2 及更早版本用这个闹钟重算图标角标，升级后清掉 */
const LEGACY_BADGE_ALARM = 'mc.badge';

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
    if (alarm.name !== CLIPBOARD_ALARM) return;
    void (async () => {
      try {
        await forward({ op: 'clipboardClear' });
      } catch {
        /** 清不掉就放弃，不在下次打开时盲目覆写用户可能已复制的其他内容 */
      }
      await browser.alarms.clear(CLIPBOARD_ALARM);
    })();
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
    // 0.8.2 及更早版本在图标上挂过备份角标，升级时把痕迹与闹钟都清掉
    void browser.action.setBadgeText({ text: '' });
    void browser.alarms.clear(LEGACY_BADGE_ALARM);
  });
});
