# Mercury 2FA

**English** | [简体中文](README.zh-CN.md)

Offline TOTP extension for Chrome and Edge. No network requests, no account, no cloud.

[Repository](https://github.com/THEME26/mercury-2fa) · [Privacy policy](https://theme26.github.io/mercury-2fa/privacy.html) · [Store materials](docs/STORE.md) · [中文](README.zh-CN.md)

Current version **v0.7.2**: QR import, shared-seed warnings, DEK confined to the offscreen process, storage routed through the service worker, store icon and 1280×800 screenshots ready. No site permissions requested at install time.

| List | Import |
|---|---|
| ![List](docs/list.png) | ![Import](docs/scan.png) |

## What works

| Area | Detail |
|---|---|
| Code generation | TOTP / HOTP / Steam via WebCrypto, no hand-rolled cryptography |
| Encryption | Argon2id (hash-wasm) derives a KEK → wraps a random DEK → AES-GCM-256 protects entries |
| Process boundary | Decryption and code generation happen only in the offscreen document; values returned to the popup carry no seed field |
| Unlock | Master password, auto-lock after 5/15/30/60 minutes idle, DEK dropped and offscreen closed on system idle or screen lock |
| Migration | On first vault creation, a v0.1 plaintext vault is encrypted and merged, then its key is deleted |
| Entries | Add / delete / pin / STEAM and HOTP variants / countdown bar turning red in the last 5 seconds; non-default algorithm, digits and period are labelled inline |
| QR scan | Capture the current tab → local zxing-wasm decode → back into the import box; accepts plain otpauth URIs and Google Authenticator migration codes |
| Import | Google Authenticator migration, Aegis, 2FAS, andOTP, Bitwarden, otpauth URI lists |
| Backup | Encrypted export and restore, master password change (re-wraps the DEK only, vault body untouched), entry count checked on restore |
| Autofill | `activeTab` injection after clicking the toolbar icon; detects the code field; handles 6-box split inputs and shadow DOM |
| Clipboard | Copied codes are overwritten by the offscreen document after the configured delay (30 s / 1 min / 2 min / never) |
| Warnings | Badge `!` when no backup has been exported for 30 days; entries sharing one seed are marked "shared seed" |
| Self-check | Four built-in checks: round-trip decrypt, wrong-password rejection, ciphertext tamper detection, derivation timing |

## Four contexts, one job each

MV3 service workers are killed at will, popups disappear when closed, and neither is a safe place for a key. The only long-lived in-memory context is the offscreen document: no UI, never seen by the user, which makes it the right place to hold the DEK.

```
popup (UI)  --commands-->  service worker (routing + storage)  --commands-->  offscreen (decrypt, generate)
                            ^ create/close document, alarms, badge, storage I/O    holds the DEK in a memory variable
                            └──────────  store requests  <───────────────────────┘
```

- **Offscreen never touches `chrome.storage`.** On Edge 158 the offscreen document exposes only `loadTimes`, `csi` and `runtime` on `chrome`; `chrome.storage` is `undefined`. Any module-level read of `browser.storage.local` throws immediately, the message listener never registers, and the popup reports "encryption process not ready". Storage access now goes through `lib/store-bridge.ts` back to the service worker, and the bridge only accepts requests whose `sender.url` ends in `offscreen.html`.
- **The popup has no decryption code path.** In the built bundle, the popup chunk contains zero matches for `argon2id`, `wrappedDek` and `AES-GCM`; those appear only in the offscreen chunk. This is grep-checkable on the artifact, not a design promise.
- **Commands pass a whitelist.** Each message is rebuilt field by field per `op` before forwarding; extra fields are dropped. Closing the offscreen document discards the DEK, so the next open always requires the password.
- **Return values pass a gate.** Outbound payloads are scanned for field names; anything containing `secret` or `secrets` is dropped. Adding an entry returns `{ id }` only, since the entry record itself carries the seed.

## QR import

"Scan QR on this page" captures the current tab, decodes locally with zxing-wasm, and fills the import box when it recognises an `otpauth://` or `otpauth-migration://` payload, reusing the same parser and preview.

Three details matter:

- **The wasm loads from the package.** zxing-wasm's default `locateFile` fetches `.wasm` from jsdelivr, which is remote code: forbidden by MV3 and incompatible with the zero-network claim. It is overridden with `new URL(<bundled asset>, location.href)`, shipping the wasm as `assets/zxing_reader-*.wasm` (946 KB). The string `jsdelivr` still appears in the bundle inside zxing's own fallback branch; `prepareZXingModule` always passes `locateFile`, so that branch never runs. Verify against `lib/qr-scan.ts` and `locateFile:Be` in the artifact.
- **Loaded on demand.** The decoder is a dynamic `import()`; the main bundle is unchanged and the 38 KB glue plus wasm load only when the button is pressed.
- **Screenshots stay local.** The `captureVisibleTab` data URL is turned into bytes in memory and handed straight to the decoder. There is no upload path.

## Autofill boundaries

Injection uses `activeTab` + `scripting.executeScript`, so the browser grants write access to the current tab only at the moment the toolbar icon is clicked. The manifest declares no `host_permissions` and no persistent `content_scripts`.

The cost is two clicks: the icon, then "Fill". In exchange, the install prompt asks only for the current tab, and store review has no host list to audit.

Scoring (additive, writes at ≥ 60):

| Signal | Points |
|---|---|
| `autocomplete="one-time-code"` | 100 |
| `autocomplete` containing otp / code | 60–90 |
| `inputmode` numeric/tel with `maxlength` 4–8 | 60 |
| name / id / placeholder / aria-label containing otp, code, token, 验证码 | 50 |
| A password field in the same form | +20 |
| Numeric `pattern` | +20 |
| `maxlength` equal to the expected digit count | +20 |
| `type=password` / hidden / not visible | excluded outright |

Four compatibility layers, each one load-bearing on some sites:

- **React / Vue controlled inputs**: assign through the native `HTMLInputElement.prototype` setter, then dispatch `input` and `change`.
- **Shadow DOM**: recursive `shadowRoot` traversal finds fields `document.querySelector` cannot see.
- **Six-box split inputs**: when a container holds 4–8 `maxlength=1` inputs and nothing else, write cell by cell with `keydown`/`keyup`.
- **Hidden ancestors**: walk the ancestor chain for `display:none` / `visibility:hidden`; checking the element alone fills invisible fields.

The fill function is self-contained. It is serialized into the page, receives no seed, no DEK and no vault reference, only a code that has already been computed.

## Clipboard handling

The copy action stays in the popup: it has focus and a user gesture, which makes the write reliable. Clearing is delegated to the offscreen document, because the popup no longer exists once closed and something must still be alive when the alarm fires.

A `chrome.alarms` entry triggers `navigator.clipboard.writeText('')` in the offscreen document, falling back to `document.execCommand('copy')`.

Two known limits, stated rather than hidden:

- `alarms` has a 30-second minimum granularity; anything shorter runs at 30 seconds, which is why no shorter option is offered.
- The extension does not request `clipboardRead` (that would add "read data you copy" to the install prompt), so it cannot tell whether the clipboard still holds its own code. Anything copied in the meantime is cleared as well.

**A countdown badge was not implemented.** A 30-second period with a 30-second alarm granularity means the badge would never change value. The slot went to backup health instead: no export for 30 days turns the badge into an amber `!`.

## Shared-seed warning

One seed across two accounts means a single leak compromises both, and it usually happens by accident when the same QR code is scanned again for a backup account. Codes are grouped by normalised seed; when a group holds more than one entry, every entry in it is marked "shared seed". The seed itself never enters the return value: the UI sees a boolean.

## Verification results

| Item | Result |
|---|---|
| Unit tests | **147** passing |
| RFC 4226 HOTP vectors (10) | all match |
| RFC 6238 six timestamps × SHA1/256/512 | 18 of 18 match |
| Command whitelist | unknown op / wrong target / missing field / oversized text / injected extra fields, each rejected |
| Storage bridge | only `target=store` with complete fields; non-offscreen senders rejected; a missing handler reports `no-handler` instead of a silent empty value |
| Offscreen without storage | with both storage areas proxied, create vault, add entry, generate code, destroy and re-unlock all pass |
| Outbound gate | a crafted return value containing `secret` is blocked; normal entry views and export text pass |
| Process boundary | no dek key in `storage.session` after vault creation; a new host returns to the locked state; code request after lock reports `locked` |
| Command layer end to end | create → add → generate → export → restore in another instance → old password rejected after change, all against the real service |
| QR | a generated sample image decodes to the original URI and parses into one GitHub entry; an image without a code returns an empty array |
| Shared seed | two entries with one seed flag each other; formatting differences still match; different seeds stay unmarked; the return value carries no seed |
| Browser end to end | real build loaded: create vault, add three entries, read codes; after "Fill GitHub" the shadow-DOM input holds the same code |
| Browser QR | real build plus bundled wasm: "Scan QR on this page" recognises the otpauth URI, fills the input, previews "GitHub alice@example.com TOTP·6 digits" |
| Reload locks | reopening the page with the same profile rebuilds the host and returns to "Vault is locked" |
| Edge 158 end to end | unpacked load: set master password → create vault → add GitHub → UI shows `948 544`, matching a local RFC 6238 computation; `chrome.storage` really is `undefined` in offscreen, and the flow still works |
| Clipboard clearing path | in the offscreen document `navigator.clipboard.writeText` always fails with `Document is not focused`; `document.execCommand('copy')` returns `true`, so clearing uses the latter |
| Chunk isolation | popup chunk has zero matches for `argon2id` / `wrappedDek` / `AES-GCM` |
| Type check | `tsc --noEmit` clean |
| Artifact | 1.31 MB (946 KB of that is wasm), permissions `storage`, `idle`, `clipboardWrite`, `activeTab`, `scripting`, `alarms`, `offscreen`, no `host_permissions` |

Two items remain unverified and require a real machine:

- The system clipboard is actually overwritten with an empty string. Only the `execCommand('copy')` return value of `true` was observed; reading the clipboard back needs a second application.
- Fill hit rate on real sites. Page structure and render timing cannot be reproduced locally.

## Not implemented

| Item | Blocker |
|---|---|
| Always-on field markers (zero click) | Needs optional host permissions and a per-site justification for store review; waiting until the activeTab path has enough field data |
| Full i18n | The UI is Chinese only; `_locales` covers name and description |
| Clock skew warning | The extension never sees why a login failed, so any verdict would be guesswork |

## Security model

Protected against:

- Vault at rest: `chrome.storage.local` holds ciphertext only; a copy of the browser profile is useless without the password.
- Seeds in the UI process: neither the popup nor the service worker has a decryption path; the DEK lives in an offscreen memory variable.
- Keys surviving browser exit: nothing is persisted; closing offscreen drops the DEK, as do lock and timeout.
- Idle sessions: idle timeout, system idle and screen lock all discard the DEK.
- Wrong password and tampered ciphertext: AES-GCM authentication fails closed with no downgrade; unwrap failure reports a wrong password, payload failure reports corruption, and the two messages differ.
- Master password change: only the DEK is re-wrapped, the old password stops working immediately.
- Pages reading seeds: fill passes one computed code; the page never sees a seed.
- Message-level escape: command whitelist, field rebuild, outbound `secret` scan.
- QR payloads: decoded locally, never through the network.

Not protected against:

- A local process reading extension memory while the vault is unlocked.
- Keyloggers and clipboard sniffers.
- A forgotten master password: no backdoor, no recovery flow, only the backup file.
- A lost recovery code.

## Architecture

```
entrypoints/popup        React UI: lock screen, list, add, import, settings
entrypoints/offscreen    the only context holding the DEK; all crypto and code generation
entrypoints/background   service worker: offscreen lifecycle, command forwarding, alarms, badge
lib/protocol.ts          command whitelist, field rebuild, outbound secret gate
lib/offscreen-router.ts  command dispatch (pure functions, testable without a browser)
lib/remote-client.ts     popup-side client mirroring the VaultService signatures
lib/qr-scan.ts           screenshot + zxing-wasm decode, wasm from a local asset
lib/clipboard.ts         clearing schedule and copy text
lib/fill/autofill.ts     the self-contained function injected into pages
lib/fill/inject.ts       activeTab injection channel and result mapping
lib/fill/site-match.ts   site and issuer matching (eTLD+1, tokenisation, edit distance)
lib/vault-service.ts     business logic (clock and storage injectable, fully unit-tested)
lib/crypto.ts            Argon2id + AES-GCM + backup format
lib/crypto-host.ts       crypto boundary; the only implementation keeps the DEK in memory
lib/browser-store.ts     storage.local / storage.session adapters
lib/importers.ts         GA protobuf, third-party JSON, otpauth URIs
lib/totp.ts …            code generation
tests/                   147 tests, including a QR fixture and jsdom autofill cases
```

## Data format

```ts
{
  schemaVersion: 2,
  kdf: { name: 'argon2id', m: 65536, t: 3, p: 1, salt: '<16B base64>' },
  wrappedDek: { iv: '<12B>', data: '<AES-GCM ciphertext>' },
  payload:    { iv: '<12B>', data: '<ciphertext of the entry JSON>' },
  entryCount: 3,
  createdAt, updatedAt
}
```

A backup file is `{ format: 'mercury-2fa-backup', version: 2, exportedAt, entryCount, vault }`. `entryCount` is stored in the clear and compared against the number of entries actually decrypted on restore. The format serves this project only and is not shared with others.

Three derivation tiers: low 19 MiB/t=2 (~100 ms), medium 64 MiB/t=3 (~400 ms), high 256 MiB/t=4 (~1.5 s). Parameters travel in the ciphertext header; switching tiers only re-wraps the key.

## Commands

```bash
npm install
npm test              # 147 tests
npm run compile       # tsc --noEmit
npm run build         # .output/chrome-mv3
npm run build:edge    # .output/edge-mv3
npm run zip           # store package, one per target
npm run pack          # build Edge and zip
npm run assets        # icons and 1280×800 store screenshots
npm run shots         # retake source screenshots from a real Edge build
```

## Loading and binding GitHub

Unpacked installs reference the build directory in place. `.output/chrome-mv3` and `.output/edge-mv3` must stay where they are; deleting or renaming the folder disables the extension. After rebuilding, click "Reload" on the extension card.

### Edge

1. Open `edge://extensions` and enable Developer mode in the left sidebar
2. Click "Load unpacked" and select `D:\2FA_THEME26\.output\edge-mv3` (the directory itself)
3. In the extension list, open "Details" for Mercury 2FA and enable "Show in toolbar"
4. `Alt+Shift+M` does the same as clicking the icon; the extension ID is `phaaiimkjbieajjhclcdmbofgnmfhech`, identical to Chrome

### Chrome

1. Open `chrome://extensions` and enable Developer mode in the top right
2. Click "Load unpacked" and select `D:\2FA_THEME26\.output\chrome-mv3`
3. Pinning and the shortcut are the same as Edge

### Binding GitHub

1. On first launch, set a master password (medium tier recommended) and store it in a password manager
2. GitHub → Settings → Password and authentication → Enable 2FA → Authenticator app
3. On GitHub's QR page, click the extension icon → Import → "Scan QR on this page", then "Import 1". Alternatively click **enter this text code** under the QR and paste the 32-character setup key into the ＋ form
4. On GitHub's verification page, click the extension icon; a "Fill GitHub" button appears at the bottom
5. **Export an encrypted backup immediately** and store GitHub's recovery codes

## Store submission

`npm run pack` produces the package with `manifest.json` at the archive root. Submission steps, listing copy, permission justifications, reviewer notes and the asset list are in `docs/STORE.md` ([Chinese](docs/STORE.zh-CN.md)). The privacy policy page is `docs/privacy.html`, published at https://theme26.github.io/mercury-2fa/privacy.html.

## Next steps

1. Real-device regression: fill on the GitHub, Google, AWS and Cloudflare login pages, and zero mis-fills across ten password-only pages
2. Confirm on a real machine that the clipboard is cleared after 30 seconds, and that no key residue survives lock, restart or sleep
3. Submit to both stores (materials in `docs/STORE.md`, privacy policy in `docs/privacy.html`)
4. Optional: enable a persistent content script in exchange for zero-click field markers

## License

MIT, see [LICENSE](LICENSE). Third-party components and their licenses are listed in [NOTICE](NOTICE).
