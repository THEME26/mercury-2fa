# Mercury 2FA 实现说明

[English](DESIGN.md) | **简体中文**

界面看不到的部分记录在这里：密钥由哪个上下文持有、wasm 为何随包分发、验证码框如何定位、存储里的密文长什么样。

## 上下文划分

MV3 的 service worker 会被随时回收，popup 一关即消失，两者都放不住密钥。offscreen 文档是唯一在保险库打开期间常驻内存的上下文：没有界面，不进用户视野。

```
popup（界面）  --命令-->  service worker（路由 + 存储）  --命令-->  offscreen（解密、取码）
                        ↑ 创建/关闭文档、闹钟、角标、读写存储            持有 DEK，只在内存变量里
                        └──────────  store 请求  ←─────────────────────┘
```

- **offscreen 不碰 `chrome.storage`。** 实测 Edge 158 的 offscreen 文档里，`chrome` 只有 `loadTimes`、`csi`、`runtime` 三个成员，`chrome.storage` 为 `undefined`。在模块顶层读 `browser.storage.local` 会当场抛异常，监听器挂不上，popup 侧只看到「加密进程未就绪」。现在 offscreen 的读写全部经 `lib/store-bridge.ts` 回到 service worker 执行，桥只接受 `sender.url` 以 `offscreen.html` 结尾的请求。
- **popup 内没有解密代码路径。** 打包产物中 popup 分块对 `argon2id`、`wrappedDek`、`AES-GCM` 的匹配数都是 0，三者只出现在 offscreen 分块。
- **命令走白名单。** 每条消息按 `op` 逐字段重建后转发，多余字段丢弃。
- **返回值过闸门。** 出站前按字段名扫描，出现 `secret` 或 `secrets` 直接丢包。添加条目只回 `{ id }`，条目记录本身带种子。

关闭 offscreen 文档即丢弃 DEK，下次打开必然要求重新输入密码。

## 二维码导入

点「扫描当前页二维码」，扩展截取当前标签页，在本地用 zxing-wasm 解码。识别到 `otpauth://` 或 `otpauth-migration://` 时回填导入框，后续走与粘贴文本相同的解析与预览。

- **wasm 从扩展包内加载。** zxing-wasm 默认的 `locateFile` 会去 jsdelivr 拉 `.wasm`，MV3 禁止远程代码，这与零网络的要求也冲突。`lib/qr-scan.ts` 改为 `new URL(<打包后的 asset>, location.href)`，wasm 以 `assets/zxing_reader-*.wasm`（946 KB）随扩展分发。产物里仍能找到 `jsdelivr` 字符串，它位于 zxing 自己的兜底分支；`prepareZXingModule` 每次都传 `locateFile`，该分支不会执行。
- **按需加载。** 解码器是动态 `import()`，38 KB 胶水代码与 wasm 在点按钮时才加载。
- **截图不出本机。** `captureVisibleTab` 的 data URL 在内存里转成字节直接交给解码器，没有任何上传路径。

## 自动填充

注入走 `activeTab` + `scripting.executeScript`。浏览器只在用户点击工具栏图标的那一刻把当前标签页的写权限交出来，因此 manifest 不声明 `host_permissions`，也没有常驻 `content_scripts`。

代价是两次点击：点图标，再点「填入」。换来的是安装面板只申请当前标签页，商店审核没有站点清单要逐条解释。

候选字段按下列信号累加，总分达到 60 才写入。

| 信号 | 分值 |
|---|---|
| `autocomplete="one-time-code"` | 100 |
| `autocomplete` 含 otp / code | 60~90 |
| `inputmode` 为 numeric/tel 且 `maxlength` 在 4~8 | 60 |
| name / id / placeholder / aria-label 含 otp、code、token、验证码 | 50 |
| 同表单内有密码字段 | +20 |
| `pattern` 为数字类 | +20 |
| `maxlength` 等于期望位数 | +20 |
| `type=password`、隐藏、不可见 | 直接排除 |

四层兼容，每一层都在某些站点上是必需的：

- **React / Vue 受控输入**：经 `HTMLInputElement.prototype` 的原生 setter 赋值，再派发 `input` 与 `change`
- **shadow DOM**：递归遍历 `shadowRoot`，找到 `document.querySelector` 看不见的字段
- **六格拆分框**：容器内为 4~8 个 `maxlength=1` 的输入且无其他字段时，逐格写入并补 `keydown`/`keyup`
- **祖先链隐藏**：沿父级检查 `display:none` / `visibility:hidden`，只查元素本身会填到看不见的框里

填充函数自包含：序列化后送进页面，拿不到种子、DEK 或保险库引用，只接收一个已算好的验证码。

## 剪贴板

复制动作留在 popup：那里有焦点与用户手势，`navigator.clipboard.writeText` 不依赖任何扩展权限就能成功。

定时清空是唯一需要权限的环节。它在 offscreen 文档里执行，时间是 30 秒到 2 分钟之后，那里既无焦点也无手势；popup 此时已关闭，闹钟需要一个仍然存活的上下文。`navigator.clipboard.writeText('')` 会以 `Document is not focused` 被拒，`document.execCommand('copy')` 只在扩展持有 `clipboardWrite` 时返回 `true`。

因此 `clipboardWrite` 放在 `optional_permissions` 里。Edge 158 实测：

| 权限状态 | popup 内复制 | offscreen 内清空 |
|---|---|---|
| 未授予（刚装好的状态） | 成功 | `execCommand` 返回 `false` |
| 已授予 | 成功 | 返回 `true` |

安装提示里不再出现任何剪贴板访问项。设置里的「允许扩展清空剪贴板」按下时才发起申请，确认气泡归浏览器所有，申请必须发生在这次点击内，按钮是唯一入口。

授权之后延时下拉出现。权限后来被收回时，延时值仍留在设置里；`shouldScheduleClear()` 要求延时非零且权限在手才创建闹钟，复制提示也会去掉「xx 后清空」那半句。

`chrome.alarms` 到点后由 offscreen 调用 `navigator.clipboard.writeText('')`，失败则退到 `document.execCommand('copy')`。

两处平台限制：

- `alarms` 的最小粒度为 30 秒，短于 30 秒的设置按 30 秒执行，因此不提供更短的选项
- 扩展不申请 `clipboardRead`（该权限会让安装提示出现「读取你复制的内容」），因此无法判断剪贴板里是否仍是自己写入的验证码。此期间用户复制的内容同样会被清掉

图标倒计时评估后放弃：30 秒周期配 30 秒粒度的闹钟，角标数字永远不会变化。角标改用于备份健康度：库里有条目且从未导出、或上次导出超过 30 天时显示琥珀色 `!`。

角标的三个重算时机：经存储通道写入 `vault.v2` 或 `settings.v1`（300 毫秒内合并）、12 小时闹钟、浏览器启动或扩展更新。缺了第一个时机，一天只重算两次，新加的条目可能迟迟不挂角标，刚做完的导出又要挂满 12 小时。

## 共用种子

同一个种子挂在两个账号上，任意一处泄露即两个账号同时失守，多数情况是给备用账号重复扫同一个二维码造成的。取码时按归一化后的种子分组，同组超过一条即两条都标「共用种子」。种子本身不进返回值，界面只拿到一个布尔值。

## 界面语言

语言偏好存在 `storage.local` 的 `ui.language`，位于加密保险库之外。锁定界面在解密任何内容之前就能按所选语言渲染。偏好若存进保险库，解锁前读不到，登录界面只能固定停在一种语言。

八份词条靠三个机制对齐：

- **一份母本。** `lib/i18n/messages/en.ts` 定出 `MessageKey = keyof typeof en`，其余语言声明为 `Record<MessageKey, string>`。少键或键名错误在 `tsc --noEmit` 阶段失败，不会拖到运行时变成空白。
- **库层只带键，不带文字。** `keys.ts` 用 `import type` 引用字典，`VaultError`、`UserError` 与填充结果因此能引用 `MessageKey`，八份字典不会进入 offscreen 分块。offscreen 分块仍是 43 KB，字典全部落在 popup 分块，文字实际渲染的位置。
- **错误在边界上翻译。** `describeError()` 依次按 key、后端 `reason`、旧 `code`、原始 message 取文案，深处抛出的错误到达界面时同样是当前语言。

`tests/i18n.test.ts` 断言八种语言的键集合完全相同、占位符与英文一致、无空词条，并覆盖语言匹配（`zh-HK` → `zh-TW`、`ru-RU` → `en`）。

manifest 声明 `default_locale: 'en'` 与 `public/_locales/{en,zh_CN,zh_TW,ja,ko,de,fr,es}/messages.json`，扩展列表里的名称与描述跟随浏览器语言，与界面内的设置互不影响。

## 数据格式

```ts
{
  schemaVersion: 2,
  kdf: { name: 'argon2id', m: 65536, t: 3, p: 1, salt: '<16B base64>' },
  wrappedDek: { iv: '<12B>', data: '<AES-GCM 密文>' },
  payload:    { iv: '<12B>', data: '<条目 JSON 的密文>' },
  entryCount: 3,
  createdAt, updatedAt
}
```

备份文件为 `{ format: 'mercury-2fa-backup', version: 2, exportedAt, entryCount, vault }`。`entryCount` 明文存放，恢复时与实际解出的条数比对。该格式只服务本项目。

v0.1 版本留下的明文库会在首次建库时加密并入，随后删除旧存储键。

三档派生强度：低 19 MiB/t=2（约 100 ms）、中 64 MiB/t=3（约 400 ms）、高 256 MiB/t=4（约 1.5 s）。参数写在密文头里，换档只重封装密钥。

## 源码结构

```
entrypoints/popup        React 界面：锁屏、列表、添加、导入、设置
entrypoints/offscreen    唯一持有 DEK 的上下文，执行全部加解密与取码
entrypoints/background   service worker：创建/关闭 offscreen、转发命令、闹钟、角标
lib/protocol.ts          命令白名单、字段重建、出站 secret 闸门
lib/offscreen-router.ts  命令分发（纯函数，可脱离浏览器测试）
lib/remote-client.ts     popup 侧客户端，签名与 VaultService 一致
lib/qr-scan.ts           截图 + zxing-wasm 解码，wasm 走本地资产
lib/clipboard.ts         清空调度与文案
lib/fill/autofill.ts     注入到页面的自包含填充函数
lib/fill/inject.ts       activeTab 注入通道与结果翻译
lib/fill/site-match.ts   站点与发行方匹配（注册域、分词、编辑距离）
lib/vault-service.ts     业务逻辑（可注入时钟与存储，全部单测覆盖）
lib/crypto.ts            Argon2id + AES-GCM + 备份格式
lib/crypto-host.ts       加密边界；唯一实现把 DEK 放在内存变量里
lib/browser-store.ts     storage.local / storage.session 适配
lib/importers.ts         GA protobuf、各家 JSON、otpauth 串
lib/i18n/                八份词条、键类型、语言匹配、语言偏好、useI18n
lib/totp.ts …            取码内核
tests/                   164 项，含二维码样本与 jsdom 填充用例
```
