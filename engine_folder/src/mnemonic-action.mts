// ========== 1. IMPORTS ==========
import type { Memonic } from "@rakz-app/mns-parser";
import { generateSid, addMemonic, updateMemonic, addTag, removeTag } from "./memory-store.mjs";
import { findSuggestionsForMemonic, type Suggestion } from "./link-engine.mjs";

// ========== 2. TYPES ==========
// Local to this file: the combined shape returned by any action that both
// mutates a mnemonic AND recomputes its suggestions in the same call, so
// the UI always gets both pieces of fresh data at once.
export interface MnemonicWithSuggestions {
  memonic: Memonic;
  suggestions: Suggestion[];
}

// ========== 3. CONSTANTS ==========
// (Empty for this file)

// ========== 4. STATE ==========
// (Empty for this file — this module holds no state of its own; it only
// orchestrates calls into memory-store and link-engine)

// ========== 5. LOGIC ==========

// ----- createMnemonic -----
// purpose: the sole entry point for creating a brand-new mnemonic. Mints
//          its sid, sanitizes its tags, adds it to the store, then immediately computes its
//          suggestions — so the UI never creates a card without also
//          getting its suggestions in the same response.
// io: in  → fields (Omit<Memonic, "sid" | "links">)
//     out → MnemonicWithSuggestions
// processes:
//   1. MINT: Generate a permanently unique SID for the new card.
//   2. SANITIZE: Sweep the incoming tags array to trim whitespace and remove case-insensitive duplicates.
//   3. CONSTRUCT: Assemble the full Memonic object, overriding the raw tags and defaulting links.
//   4. STORE: Push the newly constructed card into the active RAM.
//   5. COMPUTE: Immediately trigger the link engine to find highly-scored suggestions.
//   6. RETURN: Bundle and output the new card and its suggestions for the UI.
export function createMnemonic(
  fields: Omit<Memonic, "sid" | "links">
): MnemonicWithSuggestions {
  const sid = generateSid();
  
  // 2. SANITIZE: Clean and deduplicate the incoming tags
  const sanitizedTags: string[] = [];
  const tags = fields.tags ?? []
  for (const rawTag of fields.tags) {
      const normalized = rawTag.trim();
      if (normalized === "") continue;
      
      const alreadyExists = sanitizedTags.some(t => t.toLowerCase() === normalized.toLowerCase());
      if (!alreadyExists) {
          sanitizedTags.push(normalized);
      }
  }
  
  // 3. CONSTRUCT: Spread fields, but manually override the tags array
  const newMemonic: Memonic = {
    ...fields,
    tags: sanitizedTags, // This overwrites the dirty `fields.tags` array!
    sid,
    links: []
  };

  addMemonic(newMemonic);
  const suggestions = findSuggestionsForMemonic(sid);

  return { memonic: newMemonic, suggestions };
}

// ----- editMnemonic -----
// purpose: the sole entry point for editing an existing mnemonic's scalar
//          fields (title, type, context, importance, status, id — NOT
//          tags, NOT links/sid, same restrictions as memory-store's
//          updateMemonic). Applies the edit, then recomputes suggestions,
//          since a scalar edit (e.g. type) can shift the score.
// io: in  → sid (number), updates (Omit<Partial<Memonic>, "sid" | "links" | "tags">)
//     out → MnemonicWithSuggestions | undefined (undefined if sid not found)
// processes:
//   1. UPDATE: Call the low-level memory store to apply the partial edits.
//   2. GUARD: If the memory store returns undefined (card not found), abort and return undefined.
//   3. COMPUTE: Trigger the link engine to recalculate suggestions based on the new scalar values.
//   4. RETURN: Bundle and output the freshly updated card and its new suggestions.
export function editMnemonic(
  sid: number,
  updates: Omit<Partial<Memonic>, "sid" | "links" | "tags">
): MnemonicWithSuggestions | undefined {
  const updatedMemonic = updateMemonic(sid, updates);
  
  if (!updatedMemonic) {
    return undefined;
  }

  const suggestions = findSuggestionsForMemonic(sid);
  return { memonic: updatedMemonic, suggestions };
}

// ----- addTagToMnemonic -----
// purpose: the sole entry point for adding a tag. Tags are the primary
//          signal in similarity scoring, so this always recomputes
//          suggestions afterward.
// io: in  → sid (number), tag (string) | out → Suggestion[]
// processes:
//   1. MUTATE: Delegate the deduplicated tag insertion to the memory store.
//   2. COMPUTE: Recalculate suggestions since the newly added tag will likely increase similarity scores.
//   3. RETURN: Output the refreshed suggestion array.
export function addTagToMnemonic(sid: number, tag: string): Suggestion[] {
  addTag(sid, tag);
  return findSuggestionsForMemonic(sid);
}

// ----- removeTagFromMnemonic -----
// purpose: the sole entry point for removing a tag. Recomputes
//          suggestions afterward too — a removed tag can only ever lower
//          a score, but a previously-displayed suggestion may no longer
//          clear the threshold, so the list must be refreshed either way.
// io: in  → sid (number), tag (string) | out → Suggestion[]
// processes:
//   1. MUTATE: Delegate the case-insensitive tag removal to the memory store.
//   2. COMPUTE: Recalculate suggestions since a removed tag may drop previous scores below the threshold.
//   3. RETURN: Output the refreshed suggestion array.
export function removeTagFromMnemonic(sid: number, tag: string): Suggestion[] {
  removeTag(sid, tag);
  return findSuggestionsForMemonic(sid);
}

// ========== 6. MAIN / EXPORTS ==========
// (Functions are exported inline above)