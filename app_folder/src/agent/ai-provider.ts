// ========== src/agent/ai-provider.ts ==========
// Adapted from the proven plugin code. Three changes only:
//   1. the key comes from the OS keychain at request time (never lives in objects)
//   2. Rakz identity headers (was: Obsidian)
//   3. provider config carries NO apiKey field anymore — settings.json stays clean
// Everything else — timeouts, distinct error messages — is the plugin's paid-for wisdom, kept.
//
// FIXES vs the original draft (2026-08-17, everything else verbatim):
//   a. lives in src/agent/, NOT src/engine/ — the engine dir mirrors upstream;
//      only the TYPE of Memonic is imported (erased at compile time, so the
//      "only useLibrary touches the engine" runtime rule still holds)
//   b. getApiKey no longer swallows keychain errors: Rust deliberately returns
//      Ok("") for "no key stored" but Err("keychain unavailable: …") when the
//      OS store is unreachable — collapsing both told Linux users without
//      Secret Service "add your key" forever. setSessionKey() is the
//      session-only fallback the Rust TEAM NOTE prescribes for that case.
//   c. WebKit (the actual Tauri webview) throws "Load failed", not Chrome's
//      "Failed to fetch" — the friendly network message now catches both.

import { invoke } from "@tauri-apps/api/core";
import type { Memonic } from "@engine/types";

// ========== 2. TYPES ==========
/** One pickable model — free flag comes from /models pricing (prompt === "0"). */
export interface ModelInfo {
  id: string;
  name: string;
  free: boolean;
}

export interface AIProviderConfig {
  providerId: "openrouter";
  baseUrl: string;          // "https://openrouter.ai/api/v1"
  models: ModelInfo[];      // fallback list when /models is unreachable (free first)
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
}
interface OpenRouterResponse {
  choices: { message: { content: string } }[];
  error?: { message: string; code: number };
}

// ========== 3. CONSTANTS ==========
const OPENROUTER_TIMEOUT_MS = 30000;
const APP_REFERER = "https://github.com/Rakz-app"; // TODO: final site URL
const APP_TITLE = "Rakz";

// ========== 4. STATE ==========
// Session-only key fallback for the rare Linux-without-Secret-Service case.
// RAM only — dies with the process; the Settings layer decides when to use it.
let sessionKey = "";
export function setSessionKey(value: string) { sessionKey = value; }

// ========== 5. LOGIC ==========

// ----- getApiKey -----
// purpose:   fetch the key at the moment of use — session fallback, else keychain
// io:        in — none | out — key string ("" = unconfigured)
// errors:    keychain-unavailable REJECTS with the Rust message (do not swallow)
// processes: invoke(get_secret)                                        [auto]
async function getApiKey(): Promise<string> {
  if (sessionKey) return sessionKey;
  // the keychain is the ONLY persistent source — never settings.json, never files
  return await invoke<string>("get_secret");
}

// ----- queryOpenRouter -----
// purpose:   one chat completion with memonic context injected
// io:        in — config, model, prompts, context memonics | out — reply text
// processes: getApiKey, fetch                                          [auto]
export async function queryOpenRouter(
  config: AIProviderConfig,
  model: string,
  systemPrompt: string,
  userMessage: string,
  memonics: Memonic[],
  temperature?: number
): Promise<string> {
  // 1. key at request time — dies with this call frame
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key is not set. Add it in Settings → AI.");
  }

  // 2. build the memonic context block (unchanged from plugin)
  const memonicContext = memonics
    .map((m) => `[${m.type.toUpperCase()}] ${m.title}:\n${m.context}`)
    .join("\n\n---\n\n");
  const fullSystemPrompt = memonicContext
    ? `${systemPrompt}\n\nRelevant context:\n${memonicContext}`
    : systemPrompt;

  const requestBody: OpenRouterRequest = {
    model,
    messages: [
      { role: "system", content: fullSystemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: temperature ?? 0.7,
    max_tokens: 2000,
  };

  // 3. timeout guard — the plugin's 30s rule
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": APP_REFERER,
        "X-Title": APP_TITLE,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    // 4. distinct, human errors — copied verbatim from the plugin (keep them!)
    if (!response.ok) {
      let errorBody = "";
      try { errorBody = await response.text(); } catch { errorBody = "(unable to read error body)"; }
      if (response.status === 401 || response.status === 403)
        throw new Error(`API key rejected (${response.status}). Check your OpenRouter key in Settings.`);
      if (response.status === 429)
        throw new Error("Rate limit exceeded. Wait a moment and try again.");
      if (response.status >= 500)
        throw new Error(`OpenRouter server error (${response.status}). Try again later.`);
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    let data: OpenRouterResponse;
    try { data = await response.json(); }
    catch { throw new Error("Failed to parse OpenRouter response. The server may be having issues."); }

    if (data.error)
      throw new Error(`OpenRouter error: ${data.error.message} (code ${data.error.code})`);

    const content = data.choices?.[0]?.message?.content;
    if (!content && content !== "")
      throw new Error("OpenRouter returned an empty response. Try another model or prompt.");

    return content;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError")
      throw new Error(`AI request timed out after ${OPENROUTER_TIMEOUT_MS / 1000}s. Try a faster model.`);
    if (err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("Load failed")))
      throw new Error("Network error: unable to reach OpenRouter. Check your connection.");
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ----- listAvailableModels -----
// purpose:   live model list (FREE FIRST) with graceful fallback to the static config list — the /models endpoint is PUBLIC, no key needed
// io:        in — config | out → ModelInfo[] sorted free-first (never throws)
// processes: fetch                                                        [auto]
export async function listAvailableModels(config: AIProviderConfig): Promise<ModelInfo[]> {
  // 1. the catalog endpoint is public — fetch it even before a key exists
  try {
    const response = await fetch(`${config.baseUrl}/models`);
    if (!response.ok) return config.models;
    const data = (await response.json()) as {
      data?: { id: string; name?: string; pricing?: { prompt?: string } }[];
    };
    const list: ModelInfo[] = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      free: m.pricing?.prompt === "0",
    }));
    if (!list.length) return config.models;
    // 2. free models first, then alphabetical — the free tier is the on-ramp
    list.sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
    return list;
  } catch {
    return config.models;
  }
}
