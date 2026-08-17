// ─────────────────────────────────────────────────────────────────────────────
// Boot — load() the vault from disk into engine RAM (desktop), seed a first
// vault when empty, heal old duplication bugs, and arm the visibility flush.
// Boot guards are load-bearing (HANDOFF §3): the HMR skip-reimport guard, the
// dedupe healer, and ready-gated saves all live here.
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { appDataDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

import { createMnemonic } from "@engine/mnemonic-action";
import { fromParsedFiles } from "@engine/bridge";
import { getAllMemonics, importDocument } from "@engine/memory-store";

import {
  activeSid, dedupeExactClones, isTauri, markVaultReady, memonics, refresh, refreshSuggestions, vaultPath,
} from "./state";
import { saveNow, schedulePersist, trackManagedFile, wireFromText } from "./persistence";
import { applySettings, loadColors } from "./settings";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// Seed cards used ONLY when the vault boots empty (first run / browser).
const SEED = [
  { id: "Biology", type: "Fact", title: "The cell drinks where it's crowded.", context: "Osmosis moves water from low to high solute concentration across a semi-permeable membrane.", importance: 4, status: "active", tags: ["concentration", "membrane", "osmosis"] },
  { id: "Chemistry", type: "Fact", title: "Osmotic Pressure", context: "π = iMRT — a colligative property depending on solute concentration.", importance: 4, status: "active", tags: ["concentration", "membrane", "osmosis", "pressure"] },
  { id: "Java OOP", type: "Rule", title: "Polymorphism is many forms", context: "One interface, many implementations — a call behaves differently by runtime type.", importance: 4, status: "active", tags: ["interface", "override"] },
] satisfies { id: string; type: string; title: string; context: string; importance: number; status: string; tags: string[] }[];

// ========== 4. STATE ==========
let booted = false;

// ========== 5. LOGIC ==========

// ----- load -----
// purpose:   boot the vault into engine RAM exactly once — settings, disk scan, bridge import, seed, heal
// io:        in → none | out → Promise<void> (idempotent: later calls no-op)
// processes: loadColors, getAllMemonics, refresh, applySettings, invoke, wireFromText, fromParsedFiles, importDocument, createMnemonic, dedupeExactClones, markVaultReady, schedulePersist [auto]
export async function load(): Promise<void> {
  // 1. one boot per process — remounts and HMR must not re-run this
  if (booted) return;
  booted = true;
  loadColors();

  // 2. HMR / remount with a live engine: RAM is the source of truth — never
  //    re-import from disk on top of it (that is exactly how vaults duplicate)
  if (getAllMemonics().length > 0) {
    refresh();
    if (activeSid.value == null && memonics.value.length) activeSid.value = memonics.value[0].sid;
    refreshSuggestions();
    markVaultReady();
    return;
  }

  // 3. desktop: resolve the vault path, load settings.json, scan the tree
  if (isTauri) {
    try {
      vaultPath.value = await join(await appDataDir(), "mnemonics");
    } catch {
      /* cosmetic */
    }
    try {
      const s = await invoke<string | null>("read_mns_file", { name: "settings.json" });
      if (s != null) applySettings(JSON.parse(s));
    } catch {
      /* first run or invalid — fine */
    }
    try {
      const scan = await invoke<{ files: [string, string][]; failed?: string[] }>("read_all_mnemonics");
      const entries: { doc: ReturnType<typeof wireFromText>; hierarchy: string }[] = [];
      for (const [name, content] of scan.files ?? []) {
        // 3a. skip anything the parser cannot read (reported, never fatal)
        const wire = wireFromText(content);
        if (!wire) {
          console.warn("[rakaz] skipped unparseable vault file:", name);
          continue;
        }
        const fileHir = name.replace(/\.(mns|rkz)$/i, "");
        // 3b. 'vault' is the legacy single-file store: dissolve it — its cards
        //     regroup by subject on the next save. Every other file's actual
        //     location IS the hierarchy (§22.2)
        entries.push({ doc: wire, hierarchy: fileHir.toLowerCase() === "vault" ? "" : fileHir });
        trackManagedFile(name);
      }
      if (scan.failed?.length) console.warn("[rakaz] files the courier could not deliver:", scan.failed);
      // 3c. ONE bridge pass across the whole vault keeps cross-file links alive
      if (entries.length) {
        const { doc, dropped, duplicates } = fromParsedFiles(entries as { doc: NonNullable<ReturnType<typeof wireFromText>>; hierarchy: string }[]);
        importDocument(doc);
        if (dropped.length) console.warn("[rakaz] links dropped on load (unresolvable targets):", dropped);
        if (duplicates.length) console.warn("[rakaz] duplicate sids across vault files (first wins):", duplicates);
      }
    } catch (e) {
      console.error("[rakaz] vault load failed:", e);
    }
    // 3d. flush pending edits when the window loses visibility / closes
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void saveNow();
    });
  }

  // 4. first run (or browser): seed a starter vault
  if (getAllMemonics().length === 0) {
    for (const s of SEED) createMnemonic({ ...s, hierarchy: "" });
  }
  // 5. heal vaults doubled by old sync bugs, then publish the mirror
  const healed = dedupeExactClones();
  if (healed) console.info(`[rakaz] healed vault: removed ${healed} exact duplicate card(s)`);
  refresh();
  if (memonics.value.length) activeSid.value = memonics.value[0].sid;
  refreshSuggestions();
  markVaultReady();
  // 6. first run: write the seeded vault; migration: regroup the legacy file
  schedulePersist();
}

// ========== 6. MAIN / EXPORTS ==========
// (load is exported inline above)
