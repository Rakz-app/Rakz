// ─────────────────────────────────────────────────────────────────────────────
// useAgent() — THE AI-feature composable. Mirrors useLibrary's module-singleton
// pattern so every component shares one agent state.
//
// SECURITY CONTRACT (AI-AGENT-BRIEF §4, non-negotiable):
//   • the API key exists in exactly two places — the OS keychain and transient
//     call frames (plus the optional session-only RAM fallback for the rare
//     keychain-unavailable Linux case). NEVER settings.json (it is designed to
//     be shared), never localStorage, never a Vue ref, never echoed to the DOM
//     after saving.
//   • the model id is NOT a secret — it may persist (localStorage).
//
// KEYCHAIN STATES (deliberately distinct, from the Rust source):
//   "stored"      — get_secret returned a non-empty key
//   "unset"       — get_secret returned "" (add the key in Settings → AI)
//   "unavailable" — get_secret REJECTED with the verbatim Rust message (offer
//                   the session-only fallback here)
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { computed, ref } from "vue";

import { useLibrary } from "@/composables/library";
import type { Memonic } from "@engine/types";
import {
  listAvailableModels,
  queryOpenRouter,
  setSessionKey,
} from "@/agent/ai-provider";
import type { AIProviderConfig, ModelInfo } from "@/agent/ai-provider";
import { clearKey, readKey, saveKey } from "@/agent/keychain";

// ========== 2. TYPES ==========
/** The three keychain states the UI must distinguish. */
export type KeyStatus = "stored" | "unset" | "unavailable";

// ========== 3. CONSTANTS ==========
const MODEL_STORAGE_KEY = "rakaz.ai.model";

const OPENROUTER: AIProviderConfig = {
  providerId: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  // Offline fallback (verified against the live /models catalog): free first.
  models: [
    { id: "openrouter/free", name: "Free Models Router", free: true },
    { id: "openai/gpt-oss-20b:free", name: "OpenAI: gpt-oss-20b (free)", free: true },
    { id: "z-ai/glm-5.2:free", name: "Z.ai: GLM 5.2 (free)", free: true },
    { id: "google/gemma-4-31b-it:free", name: "Google: Gemma 4 31B (free)", free: true },
    { id: "nvidia/nemotron-3.5-lightning:free", name: "NVIDIA: Nemotron 3.5 Lightning (free)", free: true },
    { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o mini", free: false },
    { id: "anthropic/claude-3.5-haiku", name: "Anthropic: Claude 3.5 Haiku", free: false },
    { id: "google/gemini-2.0-flash-001", name: "Google: Gemini 2.0 Flash", free: false },
  ],
};

const SYSTEM_PROMPT =
  "You are RAKZ's study assistant. You help the user understand and connect " +
  "their mnemonic cards. Answer concisely and concretely, referencing the " +
  "provided cards by their titles when useful.";

// ========== 4. STATE ==========
// (module-level singletons — one shared agent for every component)
const open = ref(false);            // the Ask dialog visibility
const busy = ref(false);
const answer = ref("");
const error = ref("");
const keyStatus = ref<KeyStatus>("unset");
const keychainError = ref("");      // verbatim Rust message for "unavailable"
const models = ref<ModelInfo[]>(OPENROUTER.models);
// Default = the first FREE model — the free tier is the on-ramp.
const model = ref<string>(localStorage.getItem(MODEL_STORAGE_KEY) || OPENROUTER.models[0]!.id);

// ========== 5. LOGIC ==========

// ----- contextCards -----
// purpose:   which cards form the AI context — the bulk selection if any, else the active card
// io:        in → none | out → Memonic[] (may be empty)
// processes: none                                                        [auto]
function contextCards(): Memonic[] {
  const { memonics, selectedSids, active } = useLibrary();
  // 1. an explicit bulk selection wins
  if (selectedSids.value.length) {
    const set = new Set(selectedSids.value);
    return memonics.value.filter((m) => set.has(m.sid));
  }
  // 2. otherwise the active card, if any
  return active.value ? [active.value] : [];
}

// ----- contextCount -----
// purpose:   how many cards the next ask will carry (shown in the dialog)
// io:        in → none | out → number
// processes: none                                                        [auto]
export const contextCount = computed(() => contextCards().length);

// ----- refreshKeyStatus -----
// purpose:   read the keychain once and classify it into the three UI states
// io:        in → none | out → Promise<KeyStatus> ("" = unset; rejection = unavailable, verbatim message kept)
// processes: readKey                                                       [auto]
export async function refreshKeyStatus(): Promise<KeyStatus> {
  try {
    const key = await readKey();
    keyStatus.value = key ? "stored" : "unset";
    keychainError.value = "";
  } catch (e) {
    // keychain unreachable — show the verbatim Rust message, offer session key
    keyStatus.value = "unavailable";
    keychainError.value = String(e);
  }
  return keyStatus.value;
}

// ----- storeKey -----
// purpose:   persist a new API key in the OS keychain (or session RAM when the keychain is unreachable) — the caller's input is never kept
// io:        in → value (string) | out → Promise<KeyStatus>
// processes: saveKey, setSessionKey, refreshKeyStatus                    [auto]
export async function storeKey(value: string): Promise<KeyStatus> {
  const v = value.trim();
  // 1. an empty input just re-checks the current state
  if (!v) return refreshKeyStatus();
  // 2. keychain unreachable → the session-only RAM fallback (dies with the process)
  if (keyStatus.value === "unavailable") {
    setSessionKey(v);
    keyStatus.value = "stored";
    return keyStatus.value;
  }
  // 3. the normal path: the keychain is the ONLY persistent home
  await saveKey(v);
  return refreshKeyStatus();
}

// ----- removeKey -----
// purpose:   delete the stored key (idempotent on the Rust side); also clears any session fallback
// io:        in → none | out → Promise<KeyStatus>
// processes: setSessionKey, clearKey, refreshKeyStatus                    [auto]
export async function removeKey(): Promise<KeyStatus> {
  setSessionKey("");
  await clearKey();
  return refreshKeyStatus();
}

// ----- setModel -----
// purpose:   pick the active model (not a secret — localStorage is fine)
// io:        in → id (string) | out → none
// processes: none                                                        [auto]
export function setModel(id: string): void {
  model.value = id;
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

// ----- refreshModels -----
// purpose:   try the live /models catalog (public — no key needed); silently keep the fallback on failure
// io:        in → none | out → Promise<void>
// processes: listAvailableModels                                          [auto]
export async function refreshModels(): Promise<void> {
  models.value = await listAvailableModels(OPENROUTER);
  // keep the stored selection valid against whatever list we now have
  if (!models.value.some((m) => m.id === model.value)) setModel(models.value[0]?.id ?? model.value);
}

// ----- ask -----
// purpose:   send the user's question plus the context cards to OpenRouter and publish the answer
// io:        in → question (string) | out → Promise<boolean> (true when answered)
// processes: refreshKeyStatus, queryOpenRouter                            [auto]
export async function ask(question: string): Promise<boolean> {
  const q = question.trim();
  if (!q || busy.value) return false;
  // 1. a missing key is a settings problem, not an error banner
  await refreshKeyStatus();
  if (keyStatus.value === "unset") {
    error.value = "No API key set. Add one in Settings → AI.";
    return false;
  }
  if (keyStatus.value === "unavailable") {
    error.value = keychainError.value;
    return false;
  }
  // 2. ask — errors land in error.value with the provider's taxonomy
  busy.value = true;
  error.value = "";
  answer.value = "";
  try {
    answer.value = await queryOpenRouter(OPENROUTER, model.value, SYSTEM_PROMPT, q, contextCards());
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    busy.value = false;
  }
}

// ----- testConnection -----
// purpose:   one-round-trip health check — "Reply with the single word OK."
// io:        in → none | out → Promise<boolean> (true when the reply arrived)
// processes: ask                                                          [auto]
export async function testConnection(): Promise<boolean> {
  return ask("Reply with the single word OK.");
}

// ----- openAsk / closeAsk -----
// purpose:   show/hide the Ask dialog (shared by every entry point)
// io:        in → none | out → none
// processes: none                                                        [auto]
export function openAsk(): void {
  answer.value = "";
  error.value = "";
  open.value = true;
}
export function closeAsk(): void {
  open.value = false;
}

// ========== 6. MAIN / EXPORTS ==========
// ----- useAgent -----
// purpose:   hand every component the one shared agent API — state, key management, ask
// io:        in → none | out → the agent facade (identical surface across calls)
// processes: ask, storeKey, removeKey, refreshKeyStatus, refreshModels, testConnection [auto]
export function useAgent() {
  return {
    // state
    open, busy, answer, error, keyStatus, keychainError, models, model, contextCount,
    // actions
    ask, testConnection, openAsk, closeAsk,
    // key management
    storeKey, removeKey, refreshKeyStatus,
    // model management
    setModel, refreshModels,
  };
}
