# rakz-io

The Rust IO layer of the Rakz app. It moves bytes and keeps secrets — nothing else: **no parsing, no meaning, no network.** All logic lives in the TypeScript engine (`../engine_folder`).

## What it exposes (8 Tauri commands)

- **File couriers** over a sandboxed `$APPDATA/<identifier>/mnemonics` root: `read_mns_file`, `write_mns_file` (atomic tmp-then-rename), `delete_mns_file` (idempotent), `read_all_mnemonics` (one fat scan; anything unreadable or refused is *named* in `failed`, never silently lost), `open_root_folder`.
- **Keychain vault** (OS keychain via `keyring`): `save_secret`, `get_secret`, `delete_secret`.

All commands are `async` on purpose — sync Tauri commands run on the main thread and would freeze the UI during a big scan.

## Status: verified

`src/commands.rs` compiles clean (zero warnings, clippy-clean) against Tauri 2 and carries its own test fence — 12 tests covering the path-sandbox edges, the symlink laws (escaping links refused visibly), failure visibility, the exact JSON shape the TS side expects, and the secret contract. Run them:

```bash
cargo test
```

## Destiny

This folder is a staging bay, mirroring `engine_folder/`'s folder-per-layer pattern. When the Tauri skeleton is created, its contents move under `src-tauri/` (`src/commands.rs` → `src-tauri/src/commands.rs`, tests included, and `src/lib.rs`'s `register()` shows the exact builder wiring). Until then it builds and tests standalone.
