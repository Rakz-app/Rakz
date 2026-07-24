// ========== 1. IMPORTS ==========
import type { Memonic, Link } from "@rakz-app/mns-parser";
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
// processes:
//   1. GUARD: Fetch source and target mnemonics from RAM. Abort if either is missing.
//   2. DEDUPLICATE: Sweep the source's existing links. Abort if this edge already exists.
//   3. CONNECT: Construct the new link object and append it to the source's links array.
export function addLink(sourceSid: number, targetSid: number, title: string): void {
    const sourceMnemonic = getMemonicBySid(sourceSid);
    const targetMnemonic = getMemonicBySid(targetSid);

    // 1. Guard Clause: Ensure both nodes actually exist in RAM
    if (!sourceMnemonic || !targetMnemonic) {
        console.warn(`Link failed: Source (${sourceSid}) or Target (${targetSid}) does not exist.`);
        return;
    }

    // 2. Prevent Duplicates: Check if this exact edge already exists
    const alreadyLinked = sourceMnemonic.links.some(link => link.targetSID === targetSid);
    if (alreadyLinked) {
        return;
    }

    // 3. Create Edge: Push the new link into the source's array
    sourceMnemonic.links.push({ targetSID: targetSid, title });
}

// ----- removeLink -----
// purpose: Severs a specific edge from a source mnemonic to a target mnemonic.
// io: in --> sourceSid (number), targetSid (number) | out --> void
// processes:
//   1. GUARD: Fetch the source mnemonic from RAM. Abort if it does not exist.
//   2. SEVER: Reassign the source's links array using a filter that excludes the targetSID.
export function removeLink(sourceSid: number, targetSid: number): void {
    const sourceMnemonic = getMemonicBySid(sourceSid);

    // 1. Guard Clause: If the source doesn't exist, there is nothing to remove
    if (!sourceMnemonic) {
        return;
    }

    // 2. Sever Edge: Filter out the specific target SID from the links array
    sourceMnemonic.links = sourceMnemonic.links.filter(link => link.targetSID !== targetSid);
}

// ----- getBacklinks -----
// purpose: Sweeps the RAM array to find all mnemonics that have a link pointing TO the given sid.
// io: in --> targetSid (number) | out --> Memonic[]
// processes:
//   1. FETCH: Retrieve a secure copy of all active mnemonics from the memory store.
//   2. SWEEP: Filter the entire array of mnemonics.
//   3. MATCH: For each mnemonic, check if ANY of its links have a targetSID matching the requested ID
export function getBacklinks(targetSid: number): Memonic[] {
    // 1. FETCH: Grab the full list of cards from RAM
    const allMemonics = getAllMemonics();

    // 2 & 3. SWEEP and MATCH: Return only the cards that point to our target
    return allMemonics.filter(mnemonic => 
        mnemonic.links.some(link => link.targetSID === targetSid)
    );
}

// ----- deleteMemonicSafely -----
// purpose: Orchestrates the safe removal of a node from the graph. Sweeps all existing
//          cards to remove any dangling links pointing to this sid, then calls the 
//          low-level memory-store primitive to erase the card itself.
// io: in --> sid (number) | out --> void
// processes:
//   1. SWEEP: Find every single card in the database that points to this specific SID.
//   2. SEVER: Iterate through those incoming connections and safely cut the dangling links.
//   3. ERASE: Call the low-level RAM primitive to permanently destroy the target card.
export function deleteMemonicSafely(sid: number): void {
    // 1. SWEEP: Utilize our traversal function to find all incoming connections
    const incomingCards = getBacklinks(sid);

    // 2. SEVER: Cut the bridges so no remaining cards are pointing to a ghost
    for (const card of incomingCards) {
        removeLink(card.sid, sid);
    }

    // 3. ERASE: The graph is now clean, so we can safely nuke the node itself
    deleteMemonic(sid);
}

// ========== 6. MAIN / EXPORTS ==========
// (Functions are exported inline above)