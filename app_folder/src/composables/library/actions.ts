// ─────────────────────────────────────────────────────────────────────────────
// Actions — every write the UI can perform, routed through the engine action
// layer and followed by the mandatory refresh() + schedulePersist() pair.
// Create/edit/tag/delete/link — nothing here touches disk directly.
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { serializeToMns } from "@rakz-app/mns-parser";

import {
  addTagToMnemonic, createMnemonic, editMnemonic, removeTagFromMnemonic,
} from "@engine/mnemonic-action";
import { addLink, deleteMemonicSafely, findSuggestionsForMemonic, removeLink } from "@engine/link-engine";
import { fromParsed, toDocument } from "@engine/bridge";
import { getAllMemonics, getMemonicBySid, importDocument } from "@engine/memory-store";

import {
  active, activeSid, isTauri, memonics, refresh, refreshSuggestions, subjects, lastImportFailed,
} from "./state";
import { schedulePersist, saveNow, openVaultFolder, wireFromText } from "./persistence";
import { downloadBlob } from "./settings";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
// (none — all state lives in state.ts)

// ========== 5. LOGIC ==========

// ----- select -----
// purpose:   make a card the active one and recompute its suggestions
// io:        in → sid (number) | out → none
// processes: refreshSuggestions                                              [auto]
export function select(sid: number): void {
  activeSid.value = sid;
  refreshSuggestions();
}

// ----- create -----
// purpose:   create a card in a subject, optionally in a folder (@hir), and make it active
// io:        in → subjectId (string | undefined), hierarchy (string | undefined) | out → number (new sid)
// processes: createMnemonic, refresh, refreshSuggestions, schedulePersist   [auto]
export function create(subjectId?: string, hierarchy?: string): number {
  // 1. resolve the subject: explicit → active card's → first → placeholder
  const id = subjectId ?? active.value?.id ?? subjects.value[0]?.id ?? "Untitled";
  // 2. resolve the folder: explicit → the subject's existing one — a subject
  //    never silently splits across two files
  const hir = hierarchy != null && hierarchy !== ""
    ? String(hierarchy)
    : (memonics.value.find((m) => m.id === id)?.hierarchy ?? "");
  // 3. mint the card through the engine, publish, activate, schedule save
  const { memonic } = createMnemonic({
    id, type: "Fact", title: "Untitled memonic",
    context: "Write your explanation here.", importance: 0, status: "active", hierarchy: hir, tags: [],
  });
  refresh();
  activeSid.value = memonic.sid;
  refreshSuggestions();
  schedulePersist();
  return memonic.sid;
}

// ----- editField -----
// purpose:   edit a SCALAR field (title/type/context/importance/status/id/hierarchy — never tags/links/sid)
// io:        in → sid (number), field (string), value (unknown) | out → none
// processes: editMnemonic, refresh, refreshSuggestions, schedulePersist     [auto]
export function editField(sid: number, field: string, value: unknown): void {
  editMnemonic(sid, { [field]: value } as Parameters<typeof editMnemonic>[1]);
  refresh();
  if (sid === activeSid.value) refreshSuggestions();
  schedulePersist();
}

// ----- setTags -----
// purpose:   diff the tag list against the card's current tags and route each change through the tag actions
// io:        in → sid (number), nextTags (string[]) | out → none (no-op for unknown sid)
// processes: addTagToMnemonic, removeTagFromMnemonic, refresh, schedulePersist [auto]
export function setTags(sid: number, nextTags: string[]): void {
  // 1. unknown card — nothing to diff
  const card = getMemonicBySid(sid);
  if (!card) return;
  // 2. compute additions and removals case-insensitively
  const current = card.tags;
  const lower = (a: string[]) => a.map((t) => t.toLowerCase());
  const nextLower = lower(nextTags);
  const curLower = lower(current);
  // 3. apply the diff through the engine tag actions
  for (const t of nextTags) if (!curLower.includes(t.toLowerCase())) addTagToMnemonic(sid, t);
  for (const t of current) if (!nextLower.includes(t.toLowerCase())) removeTagFromMnemonic(sid, t);
  refresh();
  if (sid === activeSid.value) refreshSuggestions();
  schedulePersist();
}

// ----- remove -----
// purpose:   delete a card safely (backlink sweep included) and repair the active selection
// io:        in → sid (number) | out → none
// processes: deleteMemonicSafely, refresh, refreshSuggestions, schedulePersist [auto]
export function remove(sid: number): void {
  deleteMemonicSafely(sid);
  refresh();
  // 1. deleting the active card promotes the first card
  if (sid === activeSid.value) {
    activeSid.value = memonics.value[0]?.sid ?? null;
    refreshSuggestions();
  }
  schedulePersist();
}

// ----- link -----
// purpose:   accept a suggestion — create a real named link edge between two cards
// io:        in → sourceSid (number), targetSid (number), title (string) | out → none
// processes: addLink, refresh, refreshSuggestions, schedulePersist           [auto]
export function link(sourceSid: number, targetSid: number, title: string): void {
  addLink(sourceSid, targetSid, title);
  refresh();
  if (sourceSid === activeSid.value) refreshSuggestions();
  schedulePersist();
}

// ----- unlink -----
// purpose:   remove one link edge between two cards
// io:        in → sourceSid (number), targetSid (number) | out → none
// processes: removeLink, refresh, refreshSuggestions, schedulePersist       [auto]
export function unlink(sourceSid: number, targetSid: number): void {
  removeLink(sourceSid, targetSid);
  refresh();
  if (sourceSid === activeSid.value) refreshSuggestions();
  schedulePersist();
}

// ----- renameLink -----
// purpose:   rename an edge = remove + re-add with the new title — pure composition of existing engine actions (the engine has no updateLink and gains none)
// io:        in → sourceSid (number), targetSid (number), title (string) | out → none
// processes: removeLink, addLink, refresh, refreshSuggestions, schedulePersist [auto]
export function renameLink(sourceSid: number, targetSid: number, title: string): void {
  removeLink(sourceSid, targetSid);
  addLink(sourceSid, targetSid, title);
  refresh();
  if (sourceSid === activeSid.value) refreshSuggestions();
  schedulePersist();
}

// ----- importVaultText -----
// purpose:   import raw vault text (.mns or legacy .rkz JSON); foreign cards keep their @hir claims — placed there on the next save
// io:        in → text (string) | out → boolean (false when not a valid vault)
// processes: wireFromText, fromParsed, importDocument, refresh, schedulePersist [auto]
export function importVaultText(text: string): boolean {
  // 1. parse; an empty or unparseable document is a rejected import
  const wire = wireFromText(text);
  if (!wire || !wire.mnemonics.length) {
    lastImportFailed.value = true;
    return false;
  }
  // 2. bridge into engine RAM (unresolvable links dropped-and-reported)
  const { doc, dropped } = fromParsed(wire);
  importDocument(doc);
  if (dropped.length) console.warn("[rakaz] links dropped on import:", dropped);
  refresh();
  if (activeSid.value == null && memonics.value.length) activeSid.value = memonics.value[0].sid;
  refreshSuggestions();
  schedulePersist();
  lastImportFailed.value = false;
  return true;
}

// ----- exportVault -----
// purpose:   hand the user the whole vault — flush and reveal the tree (desktop) or download one .mns (browser)
// io:        in → none | out → Promise<void>
// processes: saveNow, openVaultFolder, serializeToMns, toDocument          [auto]
export async function exportVault(): Promise<void> {
  // 1. desktop: the vault IS the .mns tree — flush it and show it
  if (isTauri) {
    await saveNow();
    await openVaultFolder();
    return;
  }
  // 2. browser: download the whole vault as one canonical .mns file
  downloadBlob(new Blob([serializeToMns(toDocument(getAllMemonics()))], { type: "text/plain" }), "rakaz-vault.mns");
}

// ----- clearImportFailure -----
// purpose:   reset the inline import-failure flag once the user has seen the message
// io:        in → none | out → none
// processes: none                                                           [auto]
export function clearImportFailure(): void {
  lastImportFailed.value = false;
}

// ----- suggestionsFor -----
// purpose:   compute engine suggestions for an arbitrary sid (used outside the active card)
// io:        in → sid (number) | out → Suggestion[]
// processes: findSuggestionsForMemonic                                      [auto]
export function suggestionsFor(sid: number): ReturnType<typeof findSuggestionsForMemonic> {
  return findSuggestionsForMemonic(sid);
}

// ========== 6. MAIN / EXPORTS ==========
// (all exports declared inline above)
