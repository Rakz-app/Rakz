# Rakz Engine

The TypeScript engine for the [Rakz](https://github.com/Rakz-app) app: memory store, link engine, and mnemonic actions, built on top of the open [MNS format](https://github.com/Rakz-app/mns-parser) via `@rakz-app/mns-parser`.

## Layout

- `engine_folder/` — the engine package (`src/` holds the modules below)
  - `memory-store.mts` — the in-RAM store of mnemonics: add, update, tag, filter
  - `link-engine.mts` — computes link suggestions between mnemonics
  - `mnemonic-action.mts` — the orchestration layer the UI calls: every action returns fresh suggestions with it

