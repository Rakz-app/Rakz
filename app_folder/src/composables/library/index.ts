// ─────────────────────────────────────────────────────────────────────────────
// useLibrary() — THE data-layer facade. UI components import THIS composable
// and nothing lower-level: every read/write of vault data flows through the
// API returned here. Only the library/* modules import the engine (@engine/*)
// and the Tauri API — that seam is the architectural contract.
//
// The implementation is split by concern (state / persistence / boot / actions
// / selection / settings) but the surface is unchanged from the original
// 577-line useLibrary.js, so every component call keeps working.
// ─────────────────────────────────────────────────────────────────────────────

// ========== 1. IMPORTS ==========
import * as state from "./state";
import * as persistence from "./persistence";
import { load } from "./boot";
import * as actions from "./actions";
import * as selection from "./selection";
import * as settings from "./settings";

// ========== 2. TYPES ==========
export type { Memonic } from "@engine/types";
export type { Subject, ResolvedSuggestion, ResolvedLink } from "./state";

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
// (module singletons live in ./state)

// ========== 5. LOGIC ==========

// ----- useLibrary -----
// purpose:   hand every component the one shared vault API — state, reads, writes, bulk, I/O
// io:        in → none | out → the library facade (identical surface across calls)
// processes: state.*, persistence.*, actions.*, selection.*, settings.*    [auto]
export function useLibrary() {
  return {
    // state
    memonics: state.memonics,
    activeSid: state.activeSid,
    active: state.active,
    subjects: state.subjects,
    activeSubject: state.activeSubject,
    deck: state.deck,
    totalLinks: state.totalLinks,
    suggestions: state.suggestions,
    activeSuggestions: state.activeSuggestions,
    activeLinks: state.activeLinks,
    vaultPath: state.vaultPath,
    isDesktop: state.isTauri,
    lastImportFailed: state.lastImportFailed,
    // reads
    memonicsBySubject: state.memonicsBySubject,
    linkCount: state.linkCount,
    // writes
    load,
    select: actions.select,
    create: actions.create,
    editField: actions.editField,
    setTags: actions.setTags,
    remove: actions.remove,
    link: actions.link,
    unlink: actions.unlink,
    renameLink: actions.renameLink,
    locateCard: persistence.locateCard,
    setSubjectColor: settings.setSubjectColor,
    // vault I/O
    exportVault: actions.exportVault,
    importVault: selection.importVault,
    importVaultText: actions.importVaultText,
    clearImportFailure: actions.clearImportFailure,
    saveNow: persistence.saveNow,
    openVaultFolder: persistence.openVaultFolder,
    // settings/stats
    vaultStats: settings.vaultStats,
    estimateVaultBytes: settings.estimateVaultBytes,
    exportSettings: settings.exportSettings,
    importSettings: settings.importSettings,
    // bulk selection
    selectedSids: state.selectedSids,
    toggleSelected: selection.toggleSelected,
    clearSelected: selection.clearSelected,
    bulkMove: selection.bulkMove,
    bulkDelete: selection.bulkDelete,
    copySelection: selection.copySelection,
    exportSelection: selection.exportSelection,
    openCardFile: selection.openCardFile,
  };
}

// ========== 6. MAIN / EXPORTS ==========
// (useLibrary is exported inline above)
