# RAKZ

Mnemonic vault desktop app — Vite + Vue 3 + TypeScript frontend, Tauri 2 shell, pure-TS engine, sandboxed Rust IO.

## Layout

| folder | what | rules |
|---|---|---|
| `engine_folder/` | `@rakz/engine` — pure TS engine (store, actions, link scoring, bridge). Zero DOM/Vue/Tauri imports. | app code never edits here; it mirrors upstream `rakz-app/rakz` |
| `io_folder/` | `rakz-io` Rust crate — the 9 sandboxed Tauri commands (`safe_join`, atomic writes, keyring slot) | no parsing, no logic, no network |
| `app_folder/` | Vite + Vue 3 + TS app + thin `src-tauri` shell consuming `rakz-io` via path dep | UI components import only `@/composables/library` |

## Commands (in `app_folder/`)

```bash
npm install          # also links ../engine_folder
npm run dev          # vite dev server (browser mode)
npm run tauri dev    # desktop app
npm run build        # vue-tsc strict + vite build
npm run lint         # eslint (flat config)
npm test             # vitest
```

## Invariants (break these and solved bugs return)

1. Only `composables/library/*` imports `@engine/*` and `@tauri-apps/*` (exception: `agent/keychain.ts`, secrets only).
2. Every engine mutation is followed by `refresh()` — deep snapshots, never shared references.
3. No native `confirm()`/`alert()` (inert in the webview) — two-step arm→confirm UI.
4. Saves and `locateCard` share one serializer path (`persistence.ts`).
5. Boot guards: HMR skip-reimport, single-instance plugin FIRST, `dedupeExactClones()` healer, saves gated on ready.
6. Dot-directories are invisible to the vault scanner (`.exports/`, `settings.json` safe).
