# How Mercury 2FA works

**English** | [简体中文](DESIGN.zh-CN.md)

Implementation notes for the parts the interface does not show: which context holds the key, why the wasm ships inside the package, how a code field is located, what the stored ciphertext looks like.

## Contexts

MV3 service workers are terminated at will, and a popup disappears when it closes. Neither can hold a key. The offscreen document is the only context that keeps memory for as long as the vault is open: no interface, never shown to the user.

```
popup (UI)  --commands-->  service worker (routing + storage)  --commands-->  offscreen (decrypt, generate)
                            ^ create/close document, alarms, badge, storage I/O    holds the DEK in a memory variable
                            └──────────  store requests  <───────────────────────┘
```

- **Offscreen never touches `chrome.storage`.** On Edge 158 the offscreen document exposes only `loadTimes`, `csi` and `runtime` on `chrome`; `chrome.storage` is `undefined` there. A module-level read of `browser.storage.local` throws, the message listener never registers, and the popup reports "encryption process not ready". Storage access goes through `lib/store-bridge.ts` to the service worker, and the bridge accepts only requests whose `sender.url` ends in `offscreen.html`.
- **The popup has no decryption path.** In the built bundle the popup chunk contains zero occurrences of `argon2id`, `wrappedDek` and `AES-GCM`; all three appear only in the offscreen chunk.
- **Commands pass a whitelist.** Every message is rebuilt field by field for its `op` before forwarding; extra fields are dropped.
- **Return values pass a gate.** Outbound payloads are scanned by field name; anything called `secret` or `secrets` is dropped. Adding an entry returns `{ id }` only, because the entry record carries the seed.

Closing the offscreen document discards the DEK, so the next open always asks for the password again.

## QR import

"Scan QR on this page" captures the current tab, decodes it locally with zxing-wasm, and fills the import box when it recognises an `otpauth://` or `otpauth-migration://` payload. The payload then goes through the same parser and preview as pasted text.

- **The wasm loads from the package.** zxing-wasm's default `locateFile` fetches `.wasm` from jsdelivr, which MV3 forbids and which contradicts the zero-network claim. `lib/qr-scan.ts` overrides it with `new URL(<bundled asset>, location.href)`, so the wasm ships as `assets/zxing_reader-*.wasm` (946 KB). The string `jsdelivr` remains in the bundle inside zxing's own fallback branch; `prepareZXingModule` always passes `locateFile`, so that branch never runs.
- **Loaded on demand.** The decoder is a dynamic `import()`; the 38 KB glue and the wasm load only when the button is pressed.
- **Screenshots stay local.** The `captureVisibleTab` data URL is turned into bytes in memory and handed straight to the decoder. There is no upload path.

## Autofill

Injection uses `activeTab` + `scripting.executeScript`. The browser grants write access to the current tab only at the moment the toolbar icon is clicked, so the manifest declares no `host_permissions` and no persistent `content_scripts`.

The cost is two clicks: the icon, then "Fill". The install prompt asks only for the current tab, and store review has no host list to audit.

A candidate field is scored by adding the signals below; a total of 60 or more is written to.

| Signal | Points |
|---|---|
| `autocomplete="one-time-code"` | 100 |
| `autocomplete` containing otp / code | 60–90 |
| `inputmode` numeric/tel with `maxlength` 4–8 | 60 |
| name / id / placeholder / aria-label containing otp, code, token, 验证码 | 50 |
| A password field in the same form | +20 |
| Numeric `pattern` | +20 |
| `maxlength` equal to the expected digit count | +20 |
| `type=password`, hidden, or not visible | excluded outright |

Four compatibility layers, each one load-bearing on some sites:

- **React / Vue controlled inputs**: assign through the native `HTMLInputElement.prototype` setter, then dispatch `input` and `change`.
- **Shadow DOM**: recursive `shadowRoot` traversal finds fields `document.querySelector` cannot see.
- **Six-box split inputs**: when a container holds 4–8 `maxlength=1` inputs and nothing else, write cell by cell with `keydown`/`keyup`.
- **Hidden ancestors**: walk the ancestor chain for `display:none` / `visibility:hidden`; checking the element alone fills invisible fields.

The fill function is self-contained. It is serialized into the page and receives no seed, no DEK and no vault reference, only a code that has already been computed.

## Clipboard

The copy action stays in the popup: it has focus and a user gesture, which makes the write reliable. Clearing is delegated to the offscreen document, because the popup no longer exists once closed and something has to be alive when the alarm fires.

A `chrome.alarms` entry calls `navigator.clipboard.writeText('')` in the offscreen document, falling back to `document.execCommand('copy')`.

Two limits follow from the platform:

- `alarms` has a 30-second minimum granularity, so anything shorter runs at 30 seconds; no shorter option is offered.
- The extension does not request `clipboardRead`, which would add "read data you copy" to the install prompt. It therefore cannot tell whether the clipboard still holds its own code, and anything copied in the meantime is cleared as well.

A countdown badge was considered and dropped: a 30-second period against a 30-second alarm granularity would never change the number. The badge slot went to backup health instead, turning into an amber `!` when no export has been made for 30 days.

## Shared seeds

One seed across two accounts means a single leak compromises both, and it usually happens by accident when the same QR code is scanned again for a backup account. Codes are grouped by normalised seed; when a group holds more than one entry, every entry in it is marked "shared seed". The seed itself never enters the return value: the UI sees a boolean.

## Interface languages

The preference is stored in `storage.local` under `ui.language`, outside the encrypted vault. The lock screen therefore renders in the selected language before anything is decrypted. A preference inside the vault could not be read until after unlocking, which would leave the unlock screen in the wrong language.

Three mechanisms keep the eight dictionaries aligned:

- **One master dictionary.** `lib/i18n/messages/en.ts` defines `MessageKey = keyof typeof en`; every other locale is typed `Record<MessageKey, string>`, so a missing or misspelled key fails `tsc --noEmit` instead of rendering blank at runtime.
- **The library layer carries keys, not text.** `keys.ts` imports the dictionary with `import type`, so `VaultError`, `UserError` and the fill report reference `MessageKey` without pulling eight dictionaries into the offscreen chunk. The offscreen chunk stays at 43 KB; the dictionaries land in the popup chunk, where text is rendered.
- **Errors are localized at the boundary.** `describeError()` resolves a key first, then a backend `reason`, then a legacy `code`, then the raw message, so an error thrown deep in `vault-service` still reaches the user in the current language.

`tests/i18n.test.ts` asserts key-set equality, placeholder parity and non-empty entries across all eight locales, plus locale matching (`zh-HK` → `zh-TW`, `ru-RU` → `en`).

The manifest declares `default_locale: 'en'` and `public/_locales/{en,zh_CN,zh_TW,ja,ko,de,fr,es}/messages.json`, so the name and description in the browser's extension list follow the browser language and are independent of the in-app setting.

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

A backup file is `{ format: 'mercury-2fa-backup', version: 2, exportedAt, entryCount, vault }`. `entryCount` is stored in the clear and compared against the number of entries actually decrypted on restore. The format serves this project only.

A plaintext vault written by v0.1 builds is encrypted and merged on first vault creation, then its old storage key is deleted.

Three derivation tiers: low 19 MiB/t=2 (~100 ms), medium 64 MiB/t=3 (~400 ms), high 256 MiB/t=4 (~1.5 s). Parameters travel in the ciphertext header, so switching tiers only re-wraps the key.

## Source map

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
lib/i18n/                eight dictionaries, key type, locale detection, language preference, useI18n
lib/totp.ts …            code generation
tests/                   164 tests, including a QR fixture and jsdom autofill cases
```
