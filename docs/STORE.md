# Edge Store Submission: Materials and Steps

Version 0.8.0. Each block below can be copied into the Partner Center form as it stands. Update this file whenever the extension changes.

**English** | [简体中文](STORE.zh-CN.md)

## 1. Basic information

| Field | Value |
|---|---|
| Name (from manifest, not editable) | Mercury 2FA |
| Version | 0.8.0 |
| Category | Productivity |
| Language | English (default), plus Simplified Chinese, Traditional Chinese, Japanese, Korean, German, French and Spanish; the user switches inside Settings |
| Single purpose | Generate and fill two-factor codes on the local device |

Single purpose statement (the store requires it to be narrow):

> Generate time-based one-time passwords (TOTP) and fill them into sign-in pages. All data stays on the local device.

## 2. Store listing copy

The interface ships in eight languages and starts in English, so the English copy below is the one to submit. The Chinese copy is for a `zh-CN` listing; the manifest also declares `zh_CN`, `zh_TW`, `ja`, `ko`, `de`, `fr` and `es`, so Partner Center fills the name and description per language from the package.

Language behaviour worth writing into a listing: the choice is stored outside the encrypted vault, so the lock screen follows the selected language before the vault is opened.

### Short description (132 characters or fewer)

> Offline TOTP authenticator. No network, no account, no site permissions. Codes generated locally and autofilled into login pages.

Chinese:

> 离线的两步验证码管理器。不联网、不注册、零站点权限，验证码本地生成，可一键填入登录页。

### Detailed description (250–10000 characters)

> Mercury 2FA does one thing: compute the six digits for two-factor sign-in and put them into the login field.
>
> It differs from other authenticator extensions in three ways:
>
> 1. No network. The extension contains no request to any external host; it keeps working with networking disabled.
> 2. No site permissions. Only at the moment the toolbar icon is clicked does the browser hand over temporary write access to the current tab.
> 3. Secrets never enter the UI process. Decryption and code generation run in a separate background document; the popup only receives six digits.
>
> Features:
>
> - TOTP, HOTP and Steam codes
> - Master password, Argon2id derivation, AES-GCM-256 encryption, auto-lock when idle
> - QR import: capture the current page and decode the QR code locally
> - Migration from Google Authenticator, Aegis, 2FAS, andOTP and Bitwarden
> - Encrypted backup export and restore, with entry-count verification on restore
> - Clipboard cleared on a timer after copying
> - Interface in eight languages, switchable in Settings
>
> The master password cannot be recovered. Export a backup immediately after first use, and keep each service's recovery codes.

Chinese:

> Mercury 2FA 只做一件事：把两步验证的 6 位数字算出来，填入登录框。
>
> 与其他验证码扩展的区别有三点：
>
> 1. 不联网。整个扩展没有一条向外部主机发起的请求，装完断网也能用。
> 2. 不申请站点权限。只有点开图标的那一刻，浏览器才把当前标签页的写入权临时交出来。
> 3. 密钥不进界面进程。解密与取码在独立的后台页面完成，弹窗只拿到 6 位数字。
>
> 功能：
>
> - TOTP / HOTP / Steam 三种验证码
> - 主密码 + Argon2id 派生 + AES-GCM-256 加密，空闲自动锁定
> - 扫码导入：截图当前页，本地识别二维码
> - 从 Google Authenticator、Aegis、2FAS、andOTP、Bitwarden 迁移
> - 加密备份导出与恢复，恢复时核对条数
> - 复制后定时清空剪贴板
> - 界面支持八种语言，设置里随时切换
>
> 主密码不可找回。首次使用后立即导出备份，并保存各服务的恢复码。

### Search terms (at most 7, each 30 characters or fewer)

`2FA`、`TOTP`、`authenticator`、`验证码`、`两步验证`、`离线`、`OTP`

## 3. Permission justifications (fill one per row)

| Permission | Text to submit |
|---|---|
| `storage` | Store TOTP secrets encrypted with AES-GCM-256, plus user settings. Without it nothing can be persisted. |
| `clipboardWrite` | Copy the six-digit code to the clipboard when the user clicks an entry, then clear it on a timer from the background page so the code does not linger. |
| `idle` | Drop the decryption key from memory as soon as the system goes idle or the screen locks, shortening the exposure window. |
| `activeTab` | Grants temporary access to the current tab only after the user clicks the toolbar icon, in order to write the code into that page's verification field. No access occurs otherwise. |
| `scripting` | Execute a self-contained function inside the activeTab grant that writes the code into the input and dispatches an input event. The function does not read page content. |
| `alarms` | Two scheduled tasks: clearing the clipboard when it expires, and a backup health check that warns after 30 days without an export. |
| `offscreen` | Run Argon2id derivation, decryption and code generation in an invisible background document so the UI process never touches secrets or keys. |

Site permissions: none. Neither `host_permissions` nor `content_scripts` is requested.

## 4. Remote code declaration

Answer to "Does the extension use remote code": No.

- No CDN dependency, no `eval`, no dynamic `new Function`
- WebAssembly ships with the extension (`assets/zxing_reader-*.wasm`, 946 KB); `locateFile` points at an asset inside the package and never loads from the network
- If the string `jsdelivr` appears in the bundle, it comes from a fallback branch inside zxing-wasm. Every initialization in this project overrides `locateFile` explicitly, so that branch is unreachable. To verify, compare `assetUrl()` in `lib/qr-scan.ts` with `locateFile` in the build output

## 5. Data usage disclosure

| Question | Answer |
|---|---|
| Collect personally identifiable information | No |
| Collect health, financial or authentication information | No (secrets stay on the device, encrypted, never uploaded) |
| Collect location, browsing history or user activity | No |
| Sell or transfer data to third parties | No |
| Use data for advertising or credit assessment | No |
| Use remote code | No |

Privacy policy page: https://theme26.github.io/mercury-2fa/privacy.html — source file `docs/privacy.html`, published by GitHub Pages from the repository's `docs/` directory. Put this URL in the form.

## 6. Assets

### 6.1 Store assets (generated, ready to upload)

| Purpose | File | Spec |
|---|---|---|
| Store logo (required) | `docs/store/logo-300.png` | 300 × 300 PNG |
| Screenshot 1, code list | `docs/store/shot-1-codes.png` | 1280 × 800 PNG |
| Screenshot 2, import | `docs/store/shot-2-import.png` | 1280 × 800 PNG |
| Screenshot 3, settings and backup | `docs/store/shot-3-settings.png` | 1280 × 800 PNG |
| Screenshot 4, locked state | `docs/store/shot-4-lock.png` | 1280 × 800 PNG |
| Same four, Chinese UI | `docs/store/shot-N-*.zh-CN.png` | 1280 × 800 PNG |
| Small promo tile (optional) | `docs/store/promo-440x280.png` | 440 × 280 PNG |
| In-extension icons | `public/icon/16.png` and 3 more | 16 / 32 / 48 / 128 |

Regenerate with `npm run assets` (devDependency `sharp`; layout lives in `tools/make-assets.mjs`).

Source images are `docs/live/*.png` for English and `docs/live/zh-CN/*.png` for Chinese, captured by `tools/shoot-store.mjs`, which loads the build in a real Edge instance (4× scale, no debug output). The caption and the interface language have to match, so the two sets are shot separately:

```
npm run build:edge
npm run shots              # English, writes docs/live/
npm run shots -- zh-CN     # Chinese, writes docs/live/zh-CN/
npm run assets             # both banner sets -> docs/store/
```

`npm run assets` also overwrites `docs/list.png`, `docs/scan.png`, `docs/settings.png` and `docs/lock.png`, which the README embeds. Adding a language means adding its label set to `LABELS` in `tools/shoot-store.mjs`, capturing that set, then adding its captions to `SHOTS` in `tools/make-assets.mjs`.

### 6.2 Install package

| Item | Value |
|---|---|
| File | `.output/mercury-2fa-0.8.0-edge.zip` |
| Size | 561 KB (1.36 MB unpacked) |
| Structure | `manifest.json` at the archive root, 25 files, including the eight `_locales` folders and the three license copies under `licenses/` |
| Build | `npm run pack` (equivalent to `wxt build -b edge && wxt zip -b edge`) |

`manifest.json` must sit at the archive root, not inside an extra folder, or Partner Center fails to parse it.

## 7. Submission steps

1. Open `https://partner.microsoft.com/dashboard/microsoftedge` and sign in with a Microsoft account. First-time visitors choose "Register for the Microsoft Edge program". Registration is free and needs no credit card.
2. "Edge extensions" dashboard → New extension → upload `.output/mercury-2fa-0.8.0-edge.zip`. The system parses the manifest; continue once no red error appears.
3. Properties
   - Category: Productivity
   - Privacy policy URL: https://theme26.github.io/mercury-2fa/privacy.html
   - Collects personal information: No
   - Adult content: No
   - Website, support contact: may be left blank; the repository URL is a reasonable choice
4. Store listing
   - Display name: Mercury 2FA (from manifest)
   - Short and detailed description: copy from §2
   - Store logo: `logo-300.png`
   - Screenshots: the four `shot-*.png`, in the order list, import, settings, lock
   - Small promo tile: `promo-440x280.png`, optional
   - Search terms: the seven listed in §2
5. Availability: public; all markets; leave scheduled publishing unchecked.
6. Notes for certification: copy from §8. This paragraph sets the review pace; a reviewer who does not know the master-password flow will send the submission back.
7. Submit for certification. Review takes 1–7 business days; the result goes to the account email.
8. Once approved you get a `microsoftedge.microsoft.com/addons/detail/...` link. Later updates only need a version bump, `npm run pack`, and a fresh upload; the extension ID does not change.

## 8. Notes for certification

English:

> This extension is an offline TOTP authenticator. No sign-in and no network access are required to test every feature.
>
> Steps:
> 1. Click the toolbar icon. On first run a master password screen appears. Enter any password of 8+ characters; key derivation takes about 0.4 s.
> 2. The list is empty. Click "+" at the top right, paste `otpauth://totp/GitHub:test?secret=JBSWY3DPEHPK3PXP&issuer=GitHub` into the URI field and save.
> 3. A GitHub row appears with a 6-digit code and a countdown bar, refreshing every 30 s. Clicking the digits copies them.
> 4. "Settings" exposes auto-lock, clipboard clearing, password change and encrypted backup export.
> 5. "Lock now" returns to the password screen; unlocking requires the same password.
>
> The interface starts in English. Settings → Language lists eight languages; the choice is stored outside the encrypted vault, so the lock screen switches too, before any password is entered.
>
> Note: codes are derived from the seed and the current time, so a device clock off by more than 30 s will produce codes no server accepts. The extension makes no network requests at all and works with networking disabled.

Chinese (the interface defaults to English, so switch it first under 设置 → 语言 if the reviewer reads Chinese):

> 本扩展是离线的两步验证码生成器，不需要登录、不需要联网即可完成全部功能测试。
>
> 测试步骤：
> 1. 点击工具栏图标，首次打开显示「设置主密码」。输入任意 8 位以上密码并确认，派生耗时约 0.4 秒。
> 2. 界面进入空列表。点右上角「＋」，在链接框粘贴 `otpauth://totp/GitHub:test?secret=JBSWY3DPEHPK3PXP&issuer=GitHub`，点保存。
> 3. 列表出现一行 GitHub，右侧显示 6 位数字与倒计时进度条，每 30 秒刷新。点数字即复制。
> 4. 点「设置」可看到自动锁定、剪贴板清空、更换主密码、导出备份。
> 5. 点「立即锁定」回到密码界面，重新输入密码可解锁。
>
> 说明：验证码由种子与当前时间计算，设备时钟与真实时间相差超过 30 秒时数字不会被任何服务接受，属 TOTP 协议特性。扩展全程不发起网络请求，可在断网环境验证。

## 9. Privacy policy hosting

Done.

| Item | Value |
|---|---|
| Repository | https://github.com/THEME26/mercury-2fa |
| Page | https://theme26.github.io/mercury-2fa/privacy.html |
| Publishing | GitHub Pages, source branch `main`, directory `/docs`, `build_type: legacy` |
| Verification | Unauthenticated request returns 200, `content-type: text/html`, body carries both English and Chinese sections |

The page ships with the `docs/` directory. After editing `docs/privacy.html`, commit and push to `main`; Pages rebuilds in about a minute with no further configuration. A custom domain can be bound under repository Settings → Pages, with Enforce HTTPS enabled.

Filing and content compliance fall outside this process.

## 10. Pre-submission checklist

- [x] `npm test` — all 164 tests pass
- [x] `npm run compile` — 0 errors
- [x] `npm run build` and `npm run build:edge` both succeed
- [x] `manifest.json` has no `host_permissions` and no `content_scripts`
- [x] Icons 16 / 32 / 48 / 128 are packaged
- [x] Four screenshots at 1280 × 800, logo at 300 × 300, plus the Chinese set
- [x] ZIP root holds `manifest.json`
- [x] Privacy policy hosted and reachable anonymously
- [ ] Partner Center account registered
- [ ] Certification notes pasted

## 11. Common rejection causes

1. **Vague permission justifications**: replace "improves the experience" with a concrete action. §3 is written that way.
2. **Description out of step with features**: claiming cloud sync or password management, neither of which exists, draws a rewrite request.
3. **Privacy policy link requires a login**: raw links to gists and private repositories can demand authentication. Use Pages or a public site.
4. **Reviewer cannot reach the main screen**: the master password is set on first run rather than preset, so the notes must say "any password of 8+ characters".
5. **Remote code suspicion**: a bundled wasm file can prompt follow-up questions. Answer per §4 — the wasm ships in the package, `locateFile` points at an in-package asset.
6. **Screenshot off by one pixel**: only 1280 × 800 or 640 × 400 are accepted. Generate with `npm run assets` instead of cropping in a screenshot tool.
