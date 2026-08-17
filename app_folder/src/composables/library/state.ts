// ─────────────────────────────────────────────────────────────────────────────
// Library state — module-level singletons shared by every component.
// One vault per process: components call useLibrary() and all get the same refs.
// The engine is plain (non-reactive) module state; `memonics` is a reactive
// MIRROR refreshed from the engine after every mutation (deep snapshot — the
// engine mutates in place, invisible to Vue proxies).
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { computed, ref } from "vue";

import type { Memonic } from "@engine/types";
import type { Suggestion } from "@engine/link-engine";

import { deleteMemonicSafely, findSuggestionsForMemonic } from "@engine/link-engine";
import { getAllMemonics } from "@engine/memory-store";

// ========== 2. TYPES ==========
/** Subject projection shown in the sidebar (UI-only — the engine has no subject concept). */
export interface Subject {
  id: string;
  name: string;
  color: string;
}

/** An engine suggestion resolved against a full card (for the right panel). */
export interface ResolvedSuggestion {
  memonic: Memonic;
  score: number;
  cross: boolean;
}

/** An outgoing link edge resolved against its target card. */
export interface ResolvedLink {
  memonic: Memonic;
  title: string;
  cross: boolean;
}

// ========== 3. CONSTANTS ==========
// True when running inside the Tauri webview (desktop) vs a plain browser.
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// A UI-only palette assigned to subjects (engine `id` values) in first-seen order.
const PALETTE = ["#34D399", "#FB923C", "#A78BFA", "#EF4444", "#22D3EE", "#10B981", "#F472B6", "#FACC15"];

/** Set by boot.ts once load() finished — gates autosave (see persistence.isVaultReady). */
let ready = false;

// ========== 4. STATE ==========
// (module-level singletons — one shared vault for every component)
export const memonics = ref<Memonic[]>([]);        // reactive mirror of engine RAM
export const selectedSids = ref<number[]>([]);     // bulk-selection (Ctrl+click in the tree)
export const activeSid = ref<number | null>(null);
export const suggestions = ref<Suggestion[]>([]);  // Suggestion[] for the active card
export const colorMap = ref<Record<string, string>>({}); // subjectId -> hex (UI only)
export const vaultPath = ref<string>(isTauri ? "…" : "Browser session — vault lives in memory only");
/** Last file-import failure — rendered inline by the settings window (alert() is inert in the webview). */
export const lastImportFailed = ref(false);

// ========== 5. LOGIC ==========

// ----- isVaultReady -----
// purpose:   tell the persistence layer whether autosave is allowed yet
// io:        in → none | out → boolean (true once boot finished)
// processes: none                                                       [auto]
export function isVaultReady(): boolean {
  return ready;
}

// ----- markVaultReady -----
// purpose:   flip the autosave gate on — called by boot() when loading completes
// io:        in → none | out → none
// processes: none                                                       [auto]
export function markVaultReady(): void {
  ready = true;
}

// ----- snapshot -----
// purpose:   deep-clone one engine card so the mirror never shares references with engine RAM
// io:        in → m (Memonic, engine-owned) | out → Memonic (fresh clone)
// processes: none                                                       [auto]
function snapshot(m: Memonic): Memonic {
  return { ...m, tags: [...m.tags], links: m.links.map((l) => ({ ...l })) };
}

// ----- refresh -----
// purpose:   rebuild the reactive mirror from engine RAM — MUST run after every engine mutation
// io:        in → none | out → none (writes memonics.value)
// processes: getAllMemonics, snapshot                                   [auto]
export function refresh(): void {
  memonics.value = getAllMemonics().map(snapshot);
}

// ----- refreshSuggestions -----
// purpose:   recompute the suggestion list for the currently active card
// io:        in → none | out → none (writes suggestions.value; [] when nothing active)
// processes: findSuggestionsForMemonic                                  [auto]
export function refreshSuggestions(): void {
  suggestions.value = activeSid.value != null ? findSuggestionsForMemonic(activeSid.value) : [];
}

// ----- dedupeExactClones -----
// purpose:   one-shot healer — remove cards that are EXACT duplicates (every field, no links of their own) beyond the first
// io:        in → none (reads engine RAM) | out → number of clones removed
// processes: getAllMemonics, deleteMemonicSafely                        [auto]
export function dedupeExactClones(): number {
  // 1. fingerprint every linkless card; repeats beyond the first are clones
  const seen = new Set<string>();
  const clones: number[] = [];
  for (const m of getAllMemonics()) {
    // 1a. cards that carry links are never clones — their identity matters
    if (m.links.length) continue;
    const sig = JSON.stringify([m.id, m.type, m.title, m.context, m.importance, m.status, m.hierarchy || "", [...m.tags].sort()]);
    // 1b. first sighting registers the fingerprint, later ones mark the card for deletion
    if (seen.has(sig)) clones.push(m.sid);
    else seen.add(sig);
  }
  // 2. remove clones through the safe delete (backlink sweep included)
  for (const sid of clones) deleteMemonicSafely(sid);
  return clones.length;
}

// ----- active -----
// purpose:   the card the UI is focused on (falls back to the first card, then null)
// io:        in → none | out → Memonic | null
// processes: none                                                       [auto]
export const active = computed<Memonic | null>(() =>
  memonics.value.find((m) => m.sid === activeSid.value) ?? memonics.value[0] ?? null,
);

// ----- subjects -----
// purpose:   distinct engine `id` values in first-seen order, colored from the palette
// io:        in → none | out → Subject[]
// processes: none                                                       [auto]
export const subjects = computed<Subject[]>(() => {
  const seen: string[] = [];
  for (const m of memonics.value) if (!seen.includes(m.id)) seen.push(m.id);
  return seen.map((id, i) => ({ id, name: id, color: colorMap.value[id] ?? PALETTE[i % PALETTE.length] }));
});

// ----- activeSubject -----
// purpose:   the subject object of the active card (first subject as fallback)
// io:        in → none | out → Subject | null
// processes: subjects                                                   [auto]
export const activeSubject = computed<Subject | null>(() =>
  subjects.value.find((s) => s.id === active.value?.id) ?? subjects.value[0] ?? null,
);

// ----- memonicsBySubject -----
// purpose:   all cards belonging to one subject
// io:        in → subjectId (string, engine `id`) | out → Memonic[] (empty if none)
// processes: none                                                       [auto]
export function memonicsBySubject(subjectId: string): Memonic[] {
  return memonics.value.filter((m) => m.id === subjectId);
}

// ----- deck -----
// purpose:   cards in the active card's subject (the "deck" the arrows page through)
// io:        in → none | out → Memonic[] (empty when no active card)
// processes: none                                                       [auto]
export const deck = computed<Memonic[]>(() => {
  const a = active.value;
  return a ? memonics.value.filter((m) => m.id === a.id) : [];
});

// ----- totalLinks -----
// purpose:   total link edges across the whole vault (for stats)
// io:        in → none | out → number
// processes: none                                                       [auto]
export const totalLinks = computed<number>(() =>
  memonics.value.reduce((n, m) => n + m.links.length, 0),
);

// ----- linkCount -----
// purpose:   degree of a card — outgoing links plus backlinks from other cards
// io:        in → m (Memonic | null) | out → number (0 for null)
// processes: none                                                       [auto]
export function linkCount(m: Memonic | null): number {
  // 1. a null card has no degree
  if (!m) return 0;
  // 2. count other cards pointing at it, then add its own outgoing edges
  const backlinks = memonics.value.filter((o) => o.sid !== m.sid && o.links.some((l) => l.targetSID === m.sid)).length;
  return m.links.length + backlinks;
}

// ----- activeSuggestions -----
// purpose:   resolve the active card's engine suggestions into full cards for the panel
// io:        in → none | out → ResolvedSuggestion[] (unresolvable targets filtered out)
// processes: none                                                       [auto]
export const activeSuggestions = computed<ResolvedSuggestion[]>(() =>
  suggestions.value
    .map((s) => {
      const target = memonics.value.find((m) => m.sid === s.targetSid);
      return target ? { memonic: target, score: s.score, cross: target.id !== active.value?.id } : null;
    })
    .filter((s): s is ResolvedSuggestion => s !== null),
);

// ----- activeLinks -----
// purpose:   already-linked neighbours of the active card (outgoing edges only)
// io:        in → none | out → ResolvedLink[] (empty when no active card)
// processes: none                                                       [auto]
export const activeLinks = computed<ResolvedLink[]>(() => {
  // 1. no active card → no edges
  const a = active.value;
  if (!a) return [];
  // 2. resolve each edge's target, dropping dangling ones
  return a.links
    .map((l) => {
      const target = memonics.value.find((m) => m.sid === l.targetSID);
      return target ? { memonic: target, title: l.title, cross: target.id !== a.id } : null;
    })
    .filter((l): l is ResolvedLink => l !== null);
});

// ========== 6. MAIN / EXPORTS ==========
// (all exports declared inline above)
