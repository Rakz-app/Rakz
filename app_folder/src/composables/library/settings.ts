// ─────────────────────────────────────────────────────────────────────────────
// Settings — shareable UI settings (settings.json in the vault root) and the
// subject color map. Schema v1: `language`/`font`/`theme` are reserved keys —
// preserved on import and round-tripped, applied once the UI supports them.
// The vault scanner only reads .mns/.rkz, so settings.json never pollutes the
// mnemonic import. Colors live in localStorage (browser) AND settings.json
// (desktop) — the json travels with the vault so users can exchange it.
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import { computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

import { serializeToMns } from "@rakz-app/mns-parser";
import { toDocument } from "@engine/bridge";
import { getAllMemonics } from "@engine/memory-store";

import { colorMap, isTauri, memonics, subjects, totalLinks } from "./state";
import { openVaultFolder } from "./persistence";

// ========== 2. TYPES ==========
/** Shape of settings.json on disk (schema v1). */
export interface UiSettingsFile {
  app: "RAKZ";
  kind: "ui-settings";
  version: 1;
  colors: Record<string, string>;
  [reserved: string]: unknown;
}

// ========== 3. CONSTANTS ==========
const COLORS_STORAGE_KEY = "rakaz.colors";

// ========== 4. STATE ==========
// Reserved keys (language/font/theme...) imported from a foreign settings
// file — round-tripped untouched until the UI supports them.
let importedExtras: Record<string, unknown> = {};

// ========== 5. LOGIC ==========

// ----- loadColors -----
// purpose:   read the subject color map from localStorage at boot
// io:        in → none | out → none (writes colorMap.value; {} on corruption)
// processes: none                                                        [auto]
export function loadColors(): void {
  try {
    colorMap.value = JSON.parse(localStorage.getItem(COLORS_STORAGE_KEY) || "{}") as Record<string, string>;
  } catch {
    colorMap.value = {};
  }
}

// ----- saveColors -----
// purpose:   persist the color map to localStorage and (desktop) into settings.json
// io:        in → none | out → none
// processes: persistSettingsFile                                            [auto]
export function saveColors(): void {
  try {
    localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(colorMap.value));
  } catch {
    /* ignore */
  }
  // desktop: colors travel with the vault
  void persistSettingsFile();
}

// ----- setSubjectColor -----
// purpose:   assign a hex color to a subject and persist it everywhere
// io:        in → subjectId (string), hex (string) | out → none
// processes: saveColors                                                     [auto]
export function setSubjectColor(subjectId: string, hex: string): void {
  colorMap.value = { ...colorMap.value, [subjectId]: hex };
  saveColors();
}

// ----- settingsPayload -----
// purpose:   build the settings.json body — reserved extras + current colors
// io:        in → none | out → UiSettingsFile
// processes: none                                                          [auto]
function settingsPayload(): UiSettingsFile {
  return { app: "RAKZ", kind: "ui-settings", version: 1, ...importedExtras, colors: colorMap.value };
}

// ----- persistSettingsFile -----
// purpose:   write settings.json into the vault root (desktop only)
// io:        in → none | out → Promise<void> (errors logged)
// processes: invoke                                                        [auto]
async function persistSettingsFile(): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("write_mns_file", { name: "settings.json", content: JSON.stringify(settingsPayload(), null, 2) });
  } catch (e) {
    console.error("[rakaz] settings save failed:", e);
  }
}

// ----- applySettings -----
// purpose:   validate an incoming settings object, merge its colors, and keep its reserved keys for round-tripping
// io:        in → data (unknown, parsed JSON) | out → boolean (true when it was a valid ui-settings file)
// processes: none                                                          [auto]
export function applySettings(data: unknown): boolean {
  // 1. must be a v1 ui-settings object with a colors record
  if (!data || typeof data !== "object") return false;
  const d = data as { kind?: string; colors?: Record<string, string> };
  if (d.kind !== "ui-settings" || typeof d.colors !== "object") return false;
  // 2. strip the known keys — whatever remains is reserved extras to round-trip
  const rest = { ...(d as Record<string, unknown>) } as Record<string, unknown>;
  delete rest.app;
  delete rest.kind;
  delete rest.version;
  delete rest.colors;
  importedExtras = rest;
  // 3. merge colors into the live map and mirror to localStorage
  colorMap.value = { ...colorMap.value, ...d.colors };
  try {
    localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(colorMap.value));
  } catch {
    /* ignore */
  }
  return true;
}

// ----- exportSettings -----
// purpose:   hand the user their settings — write settings.json and open the vault (desktop) or download json (browser)
// io:        in → none | out → Promise<void>
// processes: persistSettingsFile, openVaultFolder                          [auto]
export async function exportSettings(): Promise<void> {
  // 1. desktop: the file already lives in the vault — refresh it and reveal
  if (isTauri) {
    await persistSettingsFile();
    await openVaultFolder();
    return;
  }
  // 2. browser: download a json file
  downloadBlob(new Blob([JSON.stringify(settingsPayload(), null, 2)], { type: "application/json" }), "rakaz-settings.json");
}

// ----- importSettings -----
// purpose:   pick a settings.json through a file dialog and apply it (invalid files are reported, never fatal)
// io:        in → none | out → none (applies via applySettings on success)
// processes: applySettings, persistSettingsFile                            [auto]
export function importSettings(): void {
  // 1. hidden file input stands in for a native dialog
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    // 2. read and apply; invalid json is warned, not thrown
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (applySettings(JSON.parse(String(reader.result)))) void persistSettingsFile();
        else console.warn("[rakaz] not a RAKZ ui-settings file");
      } catch {
        console.warn("[rakaz] invalid settings JSON");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ----- vaultStats -----
// purpose:   headline numbers for the settings panel
// io:        in → none | out → { cards, links, subjects }
// processes: totalLinks, subjects                                         [auto]
export const vaultStats = computed(() => ({
  cards: memonics.value.length,
  links: totalLinks.value,
  subjects: subjects.value.length,
}));

// ----- estimateVaultBytes -----
// purpose:   approximate on-disk size of the whole vault in bytes (serialized form)
// io:        in → none | out → number (0 when serialization fails)
// processes: getAllMemonics, serializeToMns, toDocument                   [auto]
export function estimateVaultBytes(): number {
  try {
    return new TextEncoder().encode(serializeToMns(toDocument(getAllMemonics()))).length;
  } catch {
    return 0;
  }
}

// ----- downloadBlob -----
// purpose:   browser-only helper — trigger a file download from an in-memory blob
// io:        in → blob (Blob), name (string) | out → none
// processes: none                                                        [auto]
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ========== 6. MAIN / EXPORTS ==========
// (all exports declared inline above)
