# Edge 上架材料与提交流程

[English](STORE.md) | **简体中文**

版本 0.8.3。本文件按「逐项复制进表单」组织，代码变更后回来同步。

## 一、基本信息

| 字段 | 值 |
|---|---|
| 名称（取自 manifest，不可改） | Mercury 2FA |
| 版本 | 0.8.3 |
| 类别 | Productivity |
| 语言 | 英文（默认），另有简体中文、繁体中文、日文、韩文、德文、法文、西班牙文，设置内切换 |
| 单一用途 | 在本机生成并填写两步验证验证码 |

单一用途陈述（商店要求，须窄）：

> 生成基于时间的一次性验证码（TOTP）并填入登录页面，数据只存本机。

## 二、商店文案

界面共八种语言，默认英文，因此主提交英文文案（见 `STORE.md` 第二节），本节的简体中文文案用于 `zh-CN` 语言列表。manifest 已声明 `zh_CN`、`zh_TW`、`ja`、`ko`、`de`、`fr`、`es`，Partner Center 会按语言从包内取名称与描述。

语言设置存在加密保险库之外，因此锁定界面也会跟着所选语言变，不必先解锁。

简短描述（132 字符内）：

> 离线的两步验证码管理器。不联网、不注册、零站点权限，验证码本地生成，可一键填入登录页。

详细描述（250–10000 字符）：

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

搜索词（7 个以内，每个 30 字符以内）：`2FA`、`TOTP`、`authenticator`、`验证码`、`两步验证`、`离线`、`OTP`

## 三、权限理由（逐条填）

| 权限 | 提交文本 |
|---|---|
| `storage` | 保存经过 AES-GCM-256 加密的验证码种子与用户设置。无此权限无法持久化任何数据。 |
| `clipboardWrite`（可选） | 用户复制验证码后按时清空剪贴板，避免验证码长期停留。该权限声明为可选，仅在用户点「允许扩展清空剪贴板」时申请；不授权也能正常复制。 |
| `idle` | 系统空闲或锁屏时立即从内存中丢弃解密密钥，缩短密钥暴露窗口。 |
| `activeTab` | 仅在用户点击扩展图标后获得当前标签页的临时访问权，用于把验证码写入页面的验证码输入框。不使用时不产生任何访问。 |
| `scripting` | 在 activeTab 授权范围内执行一段自包含函数，把验证码写入输入框并派发 input 事件。该函数不读取页面内容。 |
| `alarms` | 剪贴板到期清空。 |
| `offscreen` | 在不可见的后台文档中完成 Argon2id 派生、解密与取码，使界面进程接触不到种子与密钥。 |

站点权限：无。`host_permissions` 与 `content_scripts` 均未申请。

`clipboardWrite` 是唯一的可选权限。审核方全新安装时不会在权限提示里看到它，剪贴板清空在授权前保持关闭。

## 四、远程代码声明

表单问题「是否使用远程代码」的答案：否。

- 无 CDN 依赖，无 `eval`，无动态 `new Function`
- WebAssembly 随扩展分发（`assets/zxing_reader-*.wasm`，946 KB），`locateFile` 指向扩展内资产，不从网络加载
- 产物中若出现 `jsdelivr` 字样，来自 zxing-wasm 内置的兜底分支，本项目每次初始化都显式覆盖 `locateFile`，该分支不可达。核查方式：对照 `lib/qr-scan.ts` 的 `assetUrl()` 与产物里的 `locateFile`

## 五、数据使用披露

| 问题 | 答案 |
|---|---|
| 是否收集个人身份信息 | 否 |
| 是否收集健康、财务、认证信息 | 否（种子存本机且加密，不上传） |
| 是否收集位置、浏览历史、用户活动 | 否 |
| 是否向第三方出售或传输数据 | 否 |
| 是否用于广告或信用评估 | 否 |
| 是否使用远程代码 | 否 |

隐私政策页面：https://theme26.github.io/mercury-2fa/privacy.html （源文件 `docs/privacy.html`，经仓库 `docs/` 目录由 GitHub Pages 发布）。表单填这个地址。

## 六、素材

### 1. 商店素材（已生成，可直接上传）

| 用途 | 文件 | 规格 |
|---|---|---|
| 商店 Logo（必填） | `docs/store/logo-300.png` | 300 × 300 PNG |
| 截图 1 列表 | `docs/store/shot-1-codes.png` | 1280 × 800 PNG |
| 截图 2 导入 | `docs/store/shot-2-import.png` | 1280 × 800 PNG |
| 截图 3 设置与备份 | `docs/store/shot-3-settings.png` | 1280 × 800 PNG |
| 截图 4 锁定态 | `docs/store/shot-4-lock.png` | 1280 × 800 PNG |
| 同样四张，中文界面 | `docs/store/shot-N-*.zh-CN.png` | 1280 × 800 PNG |
| 小推广图（可选） | `docs/store/promo-440x280.png` | 440 × 280 PNG |
| 扩展内图标 | `public/icon/16.png` 等 4 个 | 16 / 32 / 48 / 128 |

重新生成：`npm run assets`（依赖 devDependency `sharp`；版式定义在 `tools/make-assets.mjs`）。

源图为英文的 `docs/live/*.png` 与中文的 `docs/live/zh-CN/*.png`，均由 `tools/shoot-store.mjs` 在真实 Edge 里加载构建产物后截取（4 倍图，无调试输出）。文案语言要与界面语言一致，两套分开截：

```
npm run build:edge
npm run shots              # 英文，写 docs/live/
npm run shots -- zh-CN     # 中文，写 docs/live/zh-CN/
npm run assets             # 两套一起出图到 docs/store/
```

设置页截图取自全新安装状态，此时剪贴板清空未开启、授权按钮可见，与审核方装好后的界面一致。

`npm run assets` 同时把干净版本覆盖到 `docs/list.png`、`docs/scan.png`、`docs/settings.png`、`docs/lock.png`，README 内嵌图随之更新。新增语言时要改 `tools/shoot-store.mjs` 的 `LABELS` 与 `tools/make-assets.mjs` 的 `SHOTS` 两处。

### 2. 安装包

| 项目 | 值 |
|---|---|
| 文件 | `.output/mercury-2fa-0.8.3-edge.zip` |
| 大小 | 562 KB（解压后 1.43 MB） |
| 结构 | `manifest.json` 在压缩包根目录，25 个文件，含八个 `_locales` 目录与 `licenses/` 三份许可证副本 |
| 生成 | `npm run pack`（等价于 `wxt build -b edge && wxt zip -b edge`） |

压缩包根目录必须是 `manifest.json`，不能多套一层文件夹，否则 Partner Center 解析失败。

## 七、提交流程

1. 打开 `https://partner.microsoft.com/dashboard/microsoftedge`，用 Microsoft 账号登录。首次进入选择「注册 Microsoft Edge 计划」，注册免费，不需要信用卡。
2. 「Edge 扩展」仪表板 → 新建扩展 → 上传 `.output/mercury-2fa-0.8.0-edge.zip`。系统解析 manifest，无红色报错即可继续。
3. 属性（Properties）
   - 类别：Productivity
   - 隐私政策 URL：https://theme26.github.io/mercury-2fa/privacy.html
   - 是否收集个人信息：否
   - 成人内容：否
   - 网站、支持联系人：可留空，建议填 GitHub 仓库地址
4. 商店列表（Store listing）
   - 显示名称：Mercury 2FA（取自 manifest）
   - 简短描述、详细描述：抄第二、三节
   - 商店 Logo：`logo-300.png`
   - 截图：4 张 `shot-*.png`，顺序按列表、扫码、设置、锁定
   - 小推广图：`promo-440x280.png`，可选
   - 搜索词：第三节列的 7 个
5. 可用性（Availability）：公开；市场选全部；不勾选定时发布。
6. 审核说明（Notes for certification）：抄第八节。这段决定审核速度，审核员不知道主密码流程就会退回。
7. 提交认证。审核周期 1–7 个工作日，结果发到账号邮箱。
8. 通过后获得 `microsoftedge.microsoft.com/addons/detail/...` 链接。后续更新只需改版本号、重新 `npm run pack`、上传新包并重新提交，扩展 ID 不变。

## 八、审核说明

中文版（提交框内可中英并列）：

> 本扩展是离线的两步验证码生成器，不需要登录、不需要联网即可完成全部功能测试。
>
> 测试步骤：
> 1. 点击工具栏图标，首次打开显示「设置主密码」。输入任意 8 位以上密码并确认，派生耗时约 0.4 秒。
> 2. 界面进入空列表。点右上角「＋」，在链接框粘贴 `otpauth://totp/GitHub:test?secret=JBSWY3DPEHPK3PXP&issuer=GitHub`，点保存。
> 3. 列表出现一行 GitHub，右侧显示 6 位数字与倒计时进度条，每 30 秒刷新。点数字即复制。
> 4. 点「设置」可看到语言、自动锁定、剪贴板清空、更换主密码、导出备份。
> 5. 点「立即锁定」回到密码界面，重新输入密码可解锁。
>
> 界面默认英文。设置 → 语言可切换八种语言，该设置存在加密保险库之外，锁定界面也会跟着变，不需要先输密码。
>
> 说明：验证码由种子与当前时间计算，设备时钟与真实时间相差超过 30 秒时数字不会被任何服务接受，属 TOTP 协议特性。扩展全程不发起网络请求，可在断网环境验证。

English version:

> This extension is an offline TOTP authenticator. No sign-in and no network access are required to test every feature.
>
> Steps:
> 1. Click the toolbar icon. On first run a master password screen appears. Enter any password of 8+ characters; key derivation takes about 0.4 s.
> 2. The list is empty. Click "+" at the top right, paste `otpauth://totp/GitHub:test?secret=JBSWY3DPEHPK3PXP&issuer=GitHub` into the URI field and save.
> 3. A GitHub row appears with a 6-digit code and a countdown bar, refreshing every 30 s. Clicking the digits copies them.
> 4. "Settings" exposes language, auto-lock, clipboard clearing, password change and encrypted backup export.
> 5. "Lock now" returns to the password screen; unlocking requires the same password.
>
> The interface starts in English. Settings → Language lists eight languages; the choice is stored outside the encrypted vault, so the lock screen switches too, before any password is entered.
>
> Note: codes are derived from the seed and the current time, so a device clock off by more than 30 s will produce codes no server accepts. The extension makes no network requests at all and works with networking disabled.

## 九、隐私政策托管

已完成。

| 项目 | 值 |
|---|---|
| 仓库 | https://github.com/THEME26/mercury-2fa |
| 页面 | https://theme26.github.io/mercury-2fa/privacy.html |
| 发布方式 | GitHub Pages，源分支 `main`，目录 `/docs`，`build_type: legacy` |
| 验证 | 未登录请求返回 200，`content-type: text/html`，正文含中英文两段 |

页面随 `docs/` 目录一起发布，改动 `docs/privacy.html` 后提交并推送 `main`，Pages 约 1 分钟自动重建，无需再次配置。自有域名可在仓库 Settings → Pages 绑定 Custom domain，同时打开 Enforce HTTPS。

备案与内容合规不在本流程内。

## 十、提交前检查

- [x] `npm test` 173 项全通过
- [x] `npm run compile` 0 错误
- [x] `npm run build` 与 `npm run build:edge` 均成功
- [x] `manifest.json` 无 `host_permissions`，无 `content_scripts`
- [x] 图标 16 / 32 / 48 / 128 已入包
- [x] 截图 4 张 1280 × 800，Logo 300 × 300，另备中文一套
- [x] ZIP 根目录为 `manifest.json`
- [x] 隐私政策已托管，匿名可访问
- [ ] Partner Center 账号已注册
- [ ] 审核说明已粘贴

## 十一、常见退回原因

1. **权限理由过于笼统**：把「提升体验」换成具体动作，第三节已按此写。
2. **描述与功能不符**：详细描述里出现扩展不具备的能力（如云同步、密码管理）会被要求修改。
3. **隐私政策链接需要登录**：Gist 与私有仓库的 raw 链接都可能要求登录，用 Pages 或公开站点。
4. **审核员无法进入主界面**：主密码是新设而非预设，审核说明必须写清「任意 8 位以上密码」。
5. **远程代码误判**：产物含 wasm 时可能被追问，按第四节回答，指明 wasm 随包分发、`locateFile` 指向扩展内资产。
6. **截图尺寸差 1 像素**：不接受非 1280 × 800 或 640 × 400 的图，用 `npm run assets` 生成而非截图工具裁切。
