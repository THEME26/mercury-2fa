import { defineConfig } from 'wxt';
import { EXTENSION_PUBLIC_KEY } from './keys/pubkey';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Mercury 2FA',
    description: '离线 TOTP 验证码，零网络请求，不依赖任何账号。',
    version: '0.1.0',
    key: EXTENSION_PUBLIC_KEY,
    permissions: ['storage', 'clipboardWrite'],
    action: {
      default_title: 'Mercury 2FA',
    },
    minimum_chrome_version: '116',
  },
});
