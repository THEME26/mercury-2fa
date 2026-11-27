# Privacy Policy

Mercury 2FA (the "extension")
Last updated: 2026-11-27

**English** | [简体中文](PRIVACY.zh-CN.md)

## 1. Data we collect

None. No accounts, no analytics, no crash reporting, no remote configuration.

## 2. Where data lives

Secrets and settings stay on the local device. `chrome.storage.local` holds only ciphertext encrypted with a key derived from your master password; plaintext exists only in the background page's memory and disappears when the browser exits.

The extension has no code path that sends data anywhere: it requests no `host_permissions` and its bundle contains no request to an external host.

## 3. Permissions

| Permission | Purpose |
|---|---|
| `storage` | Store the encrypted vault and settings |
| `clipboardWrite` (optional) | Clear the clipboard on a timer after a code is copied. Requested only when the user turns clearing on in Settings; copying works without it |
| `idle` | Drop the key from memory when the system goes idle or the screen locks |
| `activeTab` | Write a code into the current tab after the toolbar icon is clicked |
| `scripting` | Perform that write |
| `alarms` | Timer for clipboard clearing, backup health checks |
| `offscreen` | Decrypt and generate codes in a background page so the UI process never holds the key |

No browsing history, no page content, no site permissions.

## 4. Third parties

No third-party SDKs, advertising or analytics. QR decoding uses zxing-wasm, bundled with the extension and executed locally without network access.

## 5. Your control

The data is entirely in your hands: export an encrypted backup from settings at any time, or remove the extension along with its storage to erase everything. The master password cannot be recovered; a backup file is the only fallback.

## 6. Contact

Use the support channel on the extension's store listing.
