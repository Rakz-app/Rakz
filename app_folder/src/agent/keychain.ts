// ========== src/agent/keychain.ts ==========
// The SECOND Tauri seam — SECRETS ONLY. useLibrary.js remains the only module
// touching vault data + the engine; this file talks exclusively to the three
// keychain commands. The key must never live anywhere else: not settings.json
// (it is shareable and sits inside the vault), not localStorage, not a ref.
//
// Rust side (commands.rs) — one slot: Entry::new("com.rakz.app", "openrouter"):
//   save_secret(value: String)  ← the setter is save_secret, NOT set_secret,
//                                 and the payload key must be exactly `value`
//   get_secret() -> String      ← "" when no key is stored (NOT an error);
//                                 rejects "keychain unavailable: …" otherwise —
//                                 on that error, offer setSessionKey (ai-provider)
//   delete_secret()             ← no args, idempotent

import { invoke } from "@tauri-apps/api/core";

export const saveKey = (value: string) => invoke<void>("save_secret", { value });
export const readKey = () => invoke<string>("get_secret");
export const clearKey = () => invoke<void>("delete_secret");
