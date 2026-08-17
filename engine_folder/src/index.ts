// ========== 1. IMPORTS ==========
export type { Memonic, Link, MnemoDocument } from "./types";
export type { Suggestion } from "./link-engine";
export type { MnemonicWithSuggestions } from "./mnemonic-action";
export type { FilterCriteria } from "./memory-store";
export type { DroppedLink, BridgeResult, FileEntry } from "./bridge";
export { fromParsed, fromParsedFiles, toDocument } from "./bridge";
export {
  generateSid,
  addMemonic,
  deleteMemonic,
  updateMemonic,
  getAllMemonics,
  getMemonicBySid,
  filterMemonics,
  addTag,
  removeTag,
  importDocument,
} from "./memory-store";
export {
  createMnemonic,
  editMnemonic,
  addTagToMnemonic,
  removeTagFromMnemonic,
} from "./mnemonic-action";
export {
  findSuggestionsForMemonic,
  addLink,
  removeLink,
  getBacklinks,
  calculateSimilarityScore,
  deleteMemonicSafely,
} from "./link-engine";

// ========== 2. TYPES ==========
// (barrel file — no local types)

// ========== 3. CONSTANTS ==========
// (barrel file — no constants)

// ========== 4. STATE ==========
// (barrel file — no state)

// ========== 5. LOGIC ==========
// (barrel file — re-exports only)

// ========== 6. MAIN / EXPORTS ==========
// (all exports at the top — see section 1)
