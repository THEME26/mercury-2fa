import { defineConfig } from 'wxt';
import { EXTENSION_PUBLIC_KEY } from './keys/pubkey';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Mercury 2FA',
    description: '离线 TOTP 验证码，零网络请求，不依赖任何账号。',
    version: '0.6.0',
    key: EXTENSION_PUBLIC_KEY,
    /** activeTab 让用户点图标后临时获得当前标签页的注入权，脚本里不申请任何站点权限 */
    permissions: [
      'storage',
      'clipboardWrite',
      'idle',
      'activeTab',
      'scripting',
      'alarms',
      'offscreen',
    ],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+M', mac: 'Command+Shift+M' },
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: {
      default_title: 'Mercury 2FA',
    },
    minimum_chrome_version: '116',
  },
});
