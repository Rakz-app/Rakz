// ─────────────────────────────────────────────────────────────────────────────
// Persistence — how the vault reaches disk (desktop only).
// The vault is the WHOLE $APPDATA/com.rakz.app/mnemonics TREE. Saves are
// debounced (800ms), grouped by hierarchy, written atomically by the Rust
// courier, and files that empty out are deleted. Saves and locateCard share
// ONE serializer path so line numbers match the bytes on disk exactly.
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { parseMns, serializeToMns } from "@rakz-app/mns-parser";
import type { MnemoDocument as WireDocument } from "@rakz-app/mns-parser";
import { invoke } from "@tauri-apps/api/core";

import type { Memonic } from "@engine/types";
import { toDocument } from "@engine/bridge";
import { getAllMemonics } from "@engine/memory-store";

import { isTauri, isVaultReady } from "./state";

// ========== 2. TYPES ==========
/** Where a card lives on disk: vault-relative file plus 1-based line of its `mn===` opener. */
export interface CardLocation {
  file: string;
  line: number;
}

/** Loose shape of a mnemonic inside a legacy .rkz JSON export. */
interface RkzMnemonic {
  title?: string;
  context?: string;
  id?: string;
  type?: string;
  importance?: number | string;
  status?: string;
  sid?: number | string;
  hierarchy?: string;
  tags?: string[];
  links?: { title?: string; targetSID?: number | string | null }[];
}

// ========== 3. CONSTANTS ==========
const PERSIST_DEBOUNCE_MS = 800;

// ========== 4. STATE ==========
// Vault files we have read or written — a file whose last card moved or died
// is stale and gets deleted on the next save.
const managedFiles = new Set<string>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

// ========== 5. LOGIC ==========

// ----- wireFromText -----
// purpose:   turn raw file text into a parser wire document, accepting .mns and legacy .rkz JSON
// io:        in → text (string, raw file bytes) | out → WireDocument | null (unparseable)
// processes: parseMns                                                     [auto]
export function wireFromText(text: string): WireDocument | null {
  // 1. real .mns files start with the magic line
  const t = String(text);
  if (t.trimStart().startsWith("%RAKZ")) return parseMns(t);
  // 2. legacy .rkz is JSON — convert to wire shape so ONE bridge path serves both
  try {
    const data = JSON.parse(t) as Partial<{ memonics: RkzMnemonic[] }>;
    if (!data || !Array.isArray(data.memonics)) return null;
    return {
      schemaVersion: "0.1", flags: [], hierarchy: [], fileNotes: [], closedImplicitly: false,
      mnemonics: data.memonics.map((m) => ({
        title: m.title ?? "", context: m.context ?? "", id: m.id, type: m.type,
        importance: m.importance != null ? String(m.importance) : undefined,
        status: m.status, sid: m.sid != null ? String(m.sid) : undefined,
        hierarchy: m.hierarchy, tags: m.tags ?? [], keywords: [], notes: [],
        links: (m.links ?? []).map((l) => ({ title: l.title ?? "", targetSID: l.targetSID != null ? String(l.targetSID) : null })),
      })),
    };
  } catch {
    // 3. neither format — caller decides how to report
    return null;
  }
}

// ----- sanitizeHir -----
// purpose:   turn a hierarchy path into a safe relative file path ('/'-separated, no escapes, no odd chars)
// io:        in → p (string, raw hierarchy) | out → string ('vault' when empty)
// processes: none                                                          [auto]
export function sanitizeHir(p: string): string {
  // 1. split, clean, and drop empty/dot segments per path law
  const segs = String(p).split("/")
    .map((s) => s.trim().replace(/[\\:*?"<>|]/g, "-"))
    .filter((s) => s && s !== "." && s !== "..");
  // 2. rejoin, with a stable fallback name
  return segs.length ? segs.join("/") : "vault";
}

// ----- fileNameFor -----
// purpose:   the vault-relative .mns file a card saves into (hierarchy wins, subject id is the fallback)
// io:        in → m (Memonic) | out → string ('<hir>.mns')
// processes: sanitizeHir                                                    [auto]
export function fileNameFor(m: Memonic): string {
  return sanitizeHir(m.hierarchy || m.id || "vault") + ".mns";
}

// ----- saveNow -----
// purpose:   flush the whole engine RAM to disk, grouped by file, deleting files that emptied out
// io:        in → none | out → Promise<void> (errors logged, never thrown)
// processes: getAllMemonics, fileNameFor, serializeToMns, toDocument, invoke [auto]
export async function saveNow(): Promise<void> {
  // 1. desktop only, and only after boot finished — never save a half-loaded vault
  if (!isTauri || !isVaultReady()) return;
  clearTimeout(persistTimer ?? undefined);
  try {
    // 2. group every card by the file it belongs to
    const groups = new Map<string, Memonic[]>();
    for (const m of getAllMemonics()) {
      const file = fileNameFor(m);
      if (!groups.has(file)) groups.set(file, []);
      groups.get(file)!.push(m);
    }
    // 3. write each group atomically through the Rust courier
    for (const [name, cards] of groups) {
      await invoke("write_mns_file", { name, content: serializeToMns(toDocument(cards)) });
      managedFiles.add(name);
    }
    // 4. a managed file that no longer has cards is stale — remove it (idempotent)
    for (const name of [...managedFiles]) {
      if (!groups.has(name)) {
        await invoke("delete_mns_file", { name });
        managedFiles.delete(name);
      }
    }
  } catch (e) {
    console.error("[rakaz] vault save failed:", e);
  }
}

// ----- schedulePersist -----
// purpose:   debounce a save — coalesce rapid edits into one disk write
// io:        in → none | out → none
// processes: saveNow                                                      [auto]
export function schedulePersist(): void {
  if (!isTauri || !isVaultReady()) return;
  clearTimeout(persistTimer ?? undefined);
  persistTimer = setTimeout(saveNow, PERSIST_DEBOUNCE_MS);
}

// ----- openVaultFolder -----
// purpose:   reveal the vault root in the OS file manager
// io:        in → none | out → Promise<void> (errors logged)
// processes: invoke                                                       [auto]
export async function openVaultFolder(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("open_root_folder");
  } catch (e) {
    console.error("[rakaz] open folder failed:", e);
  }
}

// ----- locateCard -----
// purpose:   find where a card lives on disk (file + 1-based line) using the SAME serializer and grouping the saver uses
// io:        in → sid (number) | out → CardLocation | null (unknown sid)
// processes: getAllMemonics, fileNameFor, serializeToMns, toDocument       [auto]
export function locateCard(sid: number): CardLocation | null {
  // 1. find the card in engine RAM (not the mirror — engine is the source of truth)
  const all = getAllMemonics();
  const m = all.find((x) => x.sid === sid);
  if (!m) return null;
  // 2. rebuild the card's file group exactly as the saver would
  const file = fileNameFor(m);
  const group = all.filter((x) => fileNameFor(x) === file);
  const idx = group.findIndex((x) => x.sid === sid);
  // 3. count mn=== openers — the idx-th one is our card's line
  const lines = serializeToMns(toDocument(group)).split("\n");
  let count = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "mn===") {
      count++;
      if (count === idx) return { file, line: i + 1 };
    }
  }
  // 4. serializer produced no opener (should not happen) — point at the file top
  return { file, line: 1 };
}

// ----- copyToClipboard -----
// purpose:   put text on the clipboard with a fallback for webviews that refuse the async API
// io:        in → text (string) | out → Promise<boolean> (true when copied)
// processes: none                                                          [auto]
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. try the modern async clipboard API first
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* webview may refuse */
  }
  // 2. fall back to a hidden textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ----- trackManagedFile -----
// purpose:   register a vault file as managed (read at boot) so a later regroup deletes it when it empties
// io:        in → name (string, vault-relative) | out → none
// processes: none                                                          [auto]
export function trackManagedFile(name: string): void {
  managedFiles.add(name);
}

// ========== 6. MAIN / EXPORTS ==========
// (all exports declared inline above)
