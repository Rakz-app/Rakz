// ========== 1. IMPORTS ==========
import type { Memonic, Link } from "./types.js";
import { getAllMemonics, getMemonicBySid, deleteMemonic } from "./memory-store.mjs";

// ========== 2. TYPES ==========
// (None required for this file)

// ========== 3. CONSTANTS ==========
// (None required for this file)

// ========== 4. STATE ==========
// (None required - this module is purely functional and relies on memory-store state)

// ========== 5. LOGIC ==========

// ----- addLink -----
// purpose: Creates a directed edge from a source mnemonic to a target mnemonic.
// io: in --> sourceSid (number), targetSid (number), title (string) | out --> void
export function addLink(sourceSid: number, targetSid: number, title: string): void {
    throw new Error("NotImplemented");
}

// ----- removeLink -----
// purpose: Severs a specific edge from a source mnemonic to a target mnemonic.
// io: in --> sourceSid (number), targetSid (number) | out --> void
export function removeLink(sourceSid: number, targetSid: number): void {
    throw new Error("NotImplemented");
}

// ----- getBacklinks -----
// purpose: Sweeps the RAM array to find all mnemonics that have a link pointing TO the given sid.
// io: in --> targetSid (number) | out --> Memonic[]
export function getBacklinks(targetSid: number): Memonic[] {
    throw new Error("NotImplemented");
}

// ----- deleteMemonicSafely -----
// purpose: Orchestrates the safe removal of a node from the graph. Sweeps all existing
//          cards to remove any dangling links pointing to this sid, then calls the 
//          low-level memory-store primitive to erase the card itself.
// io: in --> sid (number) | out --> void
export function deleteMemonicSafely(sid: number): void {
    throw new Error("NotImplemented");
}

// ========== 6. MAIN / EXPORTS ==========
// (Functions are exported inline above)