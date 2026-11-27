import { defineConfig } from 'wxt';
import { EXTENSION_PUBLIC_KEY } from './keys/pubkey';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    /** 名称与描述走 _locales，浏览器按自身语言取对应文本，英文是兜底 */
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.8.2',
    key: EXTENSION_PUBLIC_KEY,
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    /** activeTab 让用户点图标后临时获得当前标签页的注入权，脚本里不申请任何站点权限 */
    permissions: ['storage', 'idle', 'activeTab', 'scripting', 'alarms', 'offscreen'],
    /** 只有「到点清空剪贴板」需要它：用户在设置里点了开关才申请 */
    optional_permissions: ['clipboardWrite'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+M', mac: 'Command+Shift+M' },
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: {
      default_title: '__MSG_extName__',
    },
    minimum_chrome_version: '116',
  },
});
