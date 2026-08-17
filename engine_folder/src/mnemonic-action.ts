// ========== 1. IMPORTS ==========
import type { Memonic } from "./types";
import {
  generateSid,
  addMemonic,
  updateMemonic,
  addTag,
  removeTag,
} from "./memory-store";
import {
  findSuggestionsForMemonic,
  type Suggestion,
} from "./link-engine";

// ========== 2. TYPES ==========
// The combined shape returned by any action that both mutates a mnemonic AND
// recomputes its suggestions in the same call.
export interface MnemonicWithSuggestions {
  memonic: Memonic;
  suggestions: Suggestion[];
}

// ========== 5. LOGIC ==========

// the sole entry point for creating a brand-new mnemonic. Mints its sid,
// sanitizes tags, stores it, then computes suggestions.
export function createMnemonic(
  fields: Omit<Memonic, "sid" | "links">,
): MnemonicWithSuggestions {
  const sid = generateSid();

  // SANITIZE: clean + case-insensitively de-dupe incoming tags.
  const sanitizedTags: string[] = [];
  const tags = fields.tags ?? [];
  for (const rawTag of tags) {
    const normalized = rawTag.trim();
    if (normalized === "") continue;
    const alreadyExists = sanitizedTags.some(
      (t) => t.toLowerCase() === normalized.toLowerCase(),
    );
    if (!alreadyExists) sanitizedTags.push(normalized);
  }

  const newMemonic: Memonic = {
    ...fields,
    tags: sanitizedTags,
    sid,
    links: [],
  };

  addMemonic(newMemonic);
  const suggestions = findSuggestionsForMemonic(sid);
  return { memonic: newMemonic, suggestions };
}

// the sole entry point for editing scalar fields (NOT tags/links/sid).
export function editMnemonic(
  sid: number,
  updates: Omit<Partial<Memonic>, "sid" | "links" | "tags">,
): MnemonicWithSuggestions | undefined {
  const updatedMemonic = updateMemonic(sid, updates);
  if (!updatedMemonic) return undefined;
  const suggestions = findSuggestionsForMemonic(sid);
  return { memonic: updatedMemonic, suggestions };
}

// the sole entry point for adding a tag; recomputes suggestions.
export function addTagToMnemonic(
  sid: number,
  tag: string,
): Suggestion[] {
  addTag(sid, tag);
  return findSuggestionsForMemonic(sid);
}

// the sole entry point for removing a tag; recomputes suggestions.
export function removeTagFromMnemonic(
  sid: number,
  tag: string,
): Suggestion[] {
  removeTag(sid, tag);
  return findSuggestionsForMemonic(sid);
}