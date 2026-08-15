# Rakz

The unified repo of the Rakz app — one folder per layer. The open [MNS format](https://github.com/Rakz-app/mns-parser) and its reference parser live in their own repo (`@rakz-app/mns-parser`); every layer of the app itself lives here.

## Layout

- `engine_folder/` — the TypeScript engine: all the logic
  - `memory-store.mts` — the in-RAM store of mnemonics: add, update, tag, filter
  - `link-engine.mts` — computes link suggestions between mnemonics
  - `mnemonic-action.mts` — the orchestration layer the UI calls: every action returns fresh suggestions with it
- `io_folder/` — the Rust IO layer (the app's Tauri commands): sandboxed file couriers + OS-keychain vault. No parsing, no logic, no network. Builds and tests standalone (`cargo test`); its contents move under `src-tauri/` when the Tauri skeleton lands.

Coming next: the Tauri skeleton (`src-tauri/`) and the UI.
