// ─────────────────────────────────────────────────────────────────────────────
// Selection — bulk selection (Ctrl+click in the tree) and the actions the
// BulkBar offers: move, delete, copy-as-.mns, export-as-.mns. Exports land in
// `.exports/` — a dot-dir the vault scanner skips, so exports are never
// re-imported as cards.
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { serializeToMns } from "@rakz-app/mns-parser";
import { invoke } from "@tauri-apps/api/core";

import { toDocument } from "@engine/bridge";
import { editMnemonic } from "@engine/mnemonic-action";
import { deleteMemonicSafely } from "@engine/link-engine";
import { getAllMemonics, getMemonicBySid } from "@engine/memory-store";

import { activeSid, isTauri, memonics, refresh, refreshSuggestions, selectedSids } from "./state";
import { copyToClipboard, locateCard, schedulePersist } from "./persistence";
import { downloadBlob } from "./settings";
import { importVaultText } from "./actions";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
// (none — selection state lives in state.ts)

// ========== 5. LOGIC ==========

// ----- toggleSelected -----
// purpose:   add/remove one sid from the bulk selection
// io:        in → sid (number) | out → none
// processes: none                                                          [auto]
export function toggleSelected(sid: number): void {
  selectedSids.value = selectedSids.value.includes(sid)
    ? selectedSids.value.filter((s) => s !== sid)
    : [...selectedSids.value, sid];
}

// ----- clearSelected -----
// purpose:   empty the bulk selection
// io:        in → none | out → none
// processes: none                                                          [auto]
export function clearSelected(): void {
  selectedSids.value = [];
}

// ----- bulkMove -----
// purpose:   move every selected card to a hierarchy ('' = regroup by subject on next save)
// io:        in → hir (string | null | undefined) | out → none
// processes: editMnemonic, refresh, refreshSuggestions, schedulePersist     [auto]
export function bulkMove(hir: string | null | undefined): void {
  const h = String(hir ?? "").trim();
  for (const sid of selectedSids.value) editMnemonic(sid, { hierarchy: h });
  refresh();
  refreshSuggestions();
  schedulePersist();
}

// ----- bulkDelete -----
// purpose:   delete every selected card safely and repair the active selection
// io:        in → none | out → none
// processes: deleteMemonicSafely, clearSelected, refresh, schedulePersist   [auto]
export function bulkDelete(): void {
  for (const sid of selectedSids.value) deleteMemonicSafely(sid);
  clearSelected();
  refresh();
  if (!getMemonicBySid(activeSid.value ?? -1)) activeSid.value = memonics.value[0]?.sid ?? null;
  refreshSuggestions();
  schedulePersist();
}

// ----- selectionText -----
// purpose:   serialize the selected cards as one canonical .mns document
// io:        in → none | out → string (empty document when nothing selected)
// processes: serializeToMns, toDocument                                    [auto]
export function selectionText(): string {
  const set = new Set(selectedSids.value);
  return serializeToMns(toDocument(getAllMemonics().filter((m) => set.has(m.sid))));
}

// ----- copySelection -----
// purpose:   put the selected cards (as .mns text) on the clipboard
// io:        in → none | out → Promise<boolean> (true when copied)
// processes: selectionText, copyToClipboard                                [auto]
export async function copySelection(): Promise<boolean> {
  return copyToClipboard(selectionText());
}

// ----- exportSelection -----
// purpose:   export the selected cards — write into .exports/ and open it (desktop) or download (browser)
// io:        in → none | out → Promise<void> (errors logged)
// processes: selectionText, invoke, downloadBlob                           [auto]
export async function exportSelection(): Promise<void> {
  const content = selectionText();
  // 1. desktop: `.exports/` is a dot-dir — the scanner skips it, so exports
  //    are never re-imported as cards. Opened in the editor right away.
  if (isTauri) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `.exports/selection-${stamp}.mns`;
    try {
      await invoke("write_mns_file", { name, content });
      await invoke("open_mns_file", { name });
    } catch (e) {
      console.error("[rakaz] export failed:", e);
    }
    return;
  }
  // 2. browser: download a .mns file
  downloadBlob(new Blob([content], { type: "text/plain" }), "rakaz-selection.mns");
}

// ----- openCardFile -----
// purpose:   open the card's file in the OS default editor (sandboxed command) and put "file:line" on the clipboard
// io:        in → sid (number) | out → CardLocation | null (unknown sid)
// processes: locateCard, copyToClipboard, invoke                           [auto]
export async function openCardFile(sid: number): Promise<{ file: string; line: number } | null> {
  const loc = locateCard(sid);
  if (!loc) return null;
  void copyToClipboard(`${loc.file}:${loc.line}`);
  if (isTauri) {
    try {
      await invoke("open_mns_file", { name: loc.file });
    } catch (e) {
      console.error("[rakaz] open file failed:", e);
    }
  }
  return loc;
}

// ----- importVault -----
// purpose:   pick a vault file (.mns / .rkz) through a file dialog and import it; failures surface via lastImportFailed (alert() is inert in the webview)
// io:        in → none | out → none
// processes: importVaultText                                               [auto]
export function importVault(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".mns,.rkz,application/json,text/plain";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void importVaultText(String(reader.result));
    };
    reader.readAsText(file);
  };
  input.click();
}

// ========== 6. MAIN / EXPORTS ==========
// (all exports declared inline above)
