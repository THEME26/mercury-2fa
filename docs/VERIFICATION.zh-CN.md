# 验证结果

[English](VERIFICATION.md) | **简体中文**

每一行把一条断言与它背后的检查配在一起。自动化项由 `npm test` 执行；浏览器项在真实 Edge 或 Chrome 配置里加载未打包产物后观测。

| 项目 | 检查方式 |
|---|---|
| 单元测试 | **168 项**全通过 |
| RFC 4226 十组 HOTP 向量 | 全部匹配 |
| RFC 6238 六时点 × SHA1/256/512 | 18 组全部匹配 |
| 命令白名单 | 未知 op、target 不符、缺字段、超长文本、多余字段注入，逐项拒绝 |
| 存储桥 | 只认 `target=store` 且字段齐全的请求；非 offscreen 来源被拒；后台无应答报 `no-handler`，不静默当空值 |
| offscreen 无 storage 场景 | 两个存储区都换成代理后，建库、加条目、取码、销毁重建后解锁全部通过 |
| 出站闸门 | 构造带 `secret` 的返回值被拦下；正常条目视图与导出文本放行 |
| 进程边界 | 建库后 `storage.session` 中没有任何 dek 键；换一个宿主即回到锁定态；锁定后取码报 `locked` |
| 命令层端到端 | 建库 → 添加 → 取码 → 导出 → 另一实例恢复 → 改密码后旧密码失效，全链路走真实服务 |
| 二维码 | 生成的样本图解码出原串，交给导入解析得到 1 条 GitHub；无码图片返回空数组 |
| 共用种子 | 同种子两条互标；写法差异仍能认出；不同种子不标；返回值不含种子 |
| 浏览器端到端 | 加载真实构建产物：建库、加三条、取码；点「填入 GitHub」后 shadow DOM 输入框得到同一串码 |
| 浏览器扫码 | 真实产物加打包的 wasm：点「扫描当前页二维码」，识别出 otpauth 串、回填输入框、预览「GitHub alice@example.com TOTP·6位」 |
| 重载即锁 | 同一配置目录重开页面，宿主重建，界面回到「保险库已锁定」 |
| Edge 158 实机全链路 | 未打包加载：设主密码 → 建库 → 加 GitHub → 界面显示 `948 544`，与本地 RFC 6238 计算一致；offscreen 内 `chrome.storage` 确为 `undefined`，链路照常跑通 |
| 剪贴板清空路径 | offscreen 内 `navigator.clipboard.writeText` 必报 `Document is not focused`；`document.execCommand('copy')` 在持有 `clipboardWrite` 时返回 `true`，不持有则返回 `false`，清空取决于这一项权限 |
| 剪贴板权限拆分 | 全新配置，`clipboardWrite` 位于 `optional_permissions`：`permissions.contains` 为 false，popup 内复制仍成功，offscreen 清空返回 false。同一份产物把该权限改为必需后，contains 为 true 且清空成功 |
| 剪贴板选开界面 | 未授权时设置页显示「未开启」与授权按钮，复制提示只有 `Copied`；授权后出现延时下拉，提示为 `Copied · clears in 30 s` |
| 分块隔离 | popup 分块中 `argon2id`、`wrappedDek`、`AES-GCM` 匹配数均为 0 |
| 类型检查 | `tsc --noEmit` 0 错误 |
| 词条对齐 | 八种语言的键集合完全相同、无空词条、占位符与英文一致；少键在类型检查阶段报错 |
| 真机切语言 | Edge 加载未打包产物：首屏英文；切到 `ja` 后各面板立即重渲染；重载后列表与锁屏仍为日文；切回 `en` 复原 |
| 清单本地化 | `chrome.runtime.getManifest().name` 取到 `Mercury 2FA`，`chrome.i18n.getMessage('extDescription')` 返回对应语言的描述，压缩包内含八种语言的 `_locales` |
| 文档语言标记 | `<html lang>` 在首帧即与渲染语言一致，包括语言未变、模板里残留旧值的英文首屏 |
| 产物 | 解压后 1.43 MB（含 946 KB wasm），权限 `storage`、`idle`、`activeTab`、`scripting`、`alarms`、`offscreen`；`clipboardWrite` 列为可选，无 `host_permissions` |

## 尚未验证

两项需要另一台机器或真实登录页：

- **系统剪贴板确实被覆写成空串。** 目前只观测到 `execCommand('copy')` 返回 `true`，读回剪贴板内容需要另一个应用配合。
- **真实站点上的填充命中率。** 页面结构与动态渲染时机无法在本地复现。计划覆盖 GitHub、Google、AWS、Cloudflare 四个登录页，以及十个只有密码框的页面，要求零误填。
