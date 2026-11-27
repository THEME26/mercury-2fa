# Verification results

**English** | [简体中文](VERIFICATION.zh-CN.md)

Each row pairs a claim with the check behind it. Automated rows run under `npm test`; browser rows were observed on a real Edge or Chrome profile with the unpacked build.

| Item | Check |
|---|---|
| Unit tests | **168** passing |
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
| Clipboard clearing path | in the offscreen document `navigator.clipboard.writeText` always fails with `Document is not focused`; `document.execCommand('copy')` returns `true` when `clipboardWrite` is held and `false` when it is not, so clearing depends on that one permission |
| Clipboard permission split | fresh profile, `clipboardWrite` under `optional_permissions`: `permissions.contains` reports false, copying from the popup still succeeds, offscreen clearing returns false. The same build with the permission declared required reports true and clears |
| Clipboard opt-in UI | without the permission, Settings shows "Clearing is off" and an enable button, and the copy toast reads `Copied`; with it, the delay selector and `Copied · clears in 30 s` appear |
| Chunk isolation | popup chunk has zero matches for `argon2id` / `wrappedDek` / `AES-GCM` |
| Type check | `tsc --noEmit` clean |
| i18n key parity | all eight dictionaries hold the same key set, no empty entry, placeholders identical to English; a missing key fails the type check |
| i18n in a real browser | unpacked build in Edge: first screen English, language switch to `ja` re-renders every panel immediately, after a reload the list and the lock screen are still Japanese, switch back to `en` restores it |
| Manifest localization | `chrome.runtime.getManifest().name` resolves to `Mercury 2FA`, `chrome.i18n.getMessage('extDescription')` returns the localized description, `_locales` for eight languages ship in the zip |
| Document language | `<html lang>` matches the rendered language on the first frame, including the initial English case where the locale never changes |
| Artifact | 1.43 MB unpacked (946 KB of that is wasm), permissions `storage`, `idle`, `activeTab`, `scripting`, `alarms`, `offscreen`; `clipboardWrite` declared optional; no `host_permissions` |

## Not verified

Two claims need a second machine or a real login page:

- **The system clipboard is actually emptied.** Only the `execCommand('copy')` return value of `true` was observed. Reading the clipboard back needs a second application.
- **Fill hit rate on real sites.** Page structure and render timing cannot be reproduced locally. The plan is GitHub, Google, AWS and Cloudflare logins plus ten password-only pages with no mis-fill.

One step is verified only by substitution:

- **The browser's own permission bubble.** `chrome.permissions.request` cannot be clicked by a script, so the grant was exercised by declaring `clipboardWrite` as a required permission instead. The code after the grant, and the clearing it enables, were measured that way. The bubble itself has not been clicked.
