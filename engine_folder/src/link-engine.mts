// ========== 1. IMPORTS ==========
import type { Memonic, Link } from "@rakz-app/mns-parser";
import { getAllMemonics, getMemonicBySid, deleteMemonic } from "./memory-store.mjs";

// ========== 2. TYPES ==========
export interface Suggestion {
    targetSid: number;
    score: number;
}

// ========== 3. CONSTANTS ==========
const TAG_WEIGHT = 5;
const TYPE_WEIGHT = 3;
const ID_WEIGHT = 8;
const SUGGESTION_THRESHOLD = 8;

// ========== 4. STATE ==========
// (None required - this module is purely functional and relies on memory-store state)

// ========== 5. LOGIC ==========

// ----- addLink -----
// purpose: Creates a directed edge from a source mnemonic to a target mnemonic.
// io: in --> sourceSid (number), targetSid (number), title (string) | out --> void
// processes:
//   1. SELF-LINK GUARD: Abort immediately if sourceSid matches targetSid.
//   2. EXISTENCE GUARD: Fetch source and target mnemonics from RAM. Abort if either is missing.
//   3. DEDUPLICATE: Sweep the source's existing links. Abort if this edge already exists.
//   4. CONNECT: Construct the new link object and append it to the source's links array.
export function addLink(sourceSid: number, targetSid: number, title: string): void {
    // 1. Self-Link Guard: A mnemonic cannot point to itself
    if (sourceSid === targetSid) {
        console.warn(`Link failed: Mnemonic cannot link to itself (${sourceSid}).`);
        return;
    }

    const sourceMnemonic = getMemonicBySid(sourceSid);
    const targetMnemonic = getMemonicBySid(targetSid);

    // 2. Existence Guard: Ensure both nodes actually exist in RAM
    if (!sourceMnemonic || !targetMnemonic) {
        console.warn(`Link failed: Source (${sourceSid}) or Target (${targetSid}) does not exist.`);
        return;
    }

    // 3. Prevent Duplicates: Check if this exact edge already exists
    const alreadyLinked = sourceMnemonic.links.some(link => link.targetSID === targetSid);
    if (alreadyLinked) {
        return;
    }

    // 4. Create Edge: Push the new link into the source's array
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

// ----- calculateSimilarityScore -----
// purpose: score how related two mnemonics are, based on shared tags, type, and id
// io: in -> mnemonicA (Memonic), mnemonicB (Memonic) | out -> number
// processes:
//   1. TAG MATCHING: Count the exact number of shared tags (case-insensitive).
//   2. BASE SCORE: Multiply the shared tag count by TAG_WEIGHT.
//   3. TYPE BONUS: Add TYPE_WEIGHT if both cards share the exact same type.
//   4. ID BONUS: Add ID_WEIGHT if both cards share the exact same non-null ID.
//   5. RETURN: Output the final calculated total score.
export function calculateSimilarityScore(a: Memonic, b: Memonic): number {
    // 1. Calculate shared tags (case-insensitive)
    const aTags = a.tags.map(t => t.toLowerCase());
    const bTags = b.tags.map(t => t.toLowerCase());
    
    // Filter tags in A that also exist in B, then get the length
    const sharedTagCount = aTags.filter(tag => bTags.includes(tag)).length;

    // 2. Base score
    let totalScore = sharedTagCount * TAG_WEIGHT;

    // 3. Type bonus
    if (a.type === b.type) {
        totalScore += TYPE_WEIGHT;
    }

    // 4. ID bonus (Ensures both IDs exist and perfectly match)
    if (a.id && b.id && a.id === b.id) {
        totalScore += ID_WEIGHT;
    }

    return totalScore;
}

// ----- findSuggestionsForMemonic -----
// purpose: scan the whole store for mnemonics related to the given one,
//          returning any pairing whose score clears the threshold and isn't already linked
// io: in -> sid (number) | out -> Suggestion[]
// processes:
//   1. GUARD: Fetch the target mnemonic by sid. Abort if it doesn't exist.
//   2. MAPPING: Build a Set of all existing linked SIDs (both outgoing and incoming) to avoid duplicate suggestions.
//   3. SWEEP: Iterate over all mnemonics in the system.
//   4. FILTER: Skip the target card itself and any card already in the linked Set.
//   5. SCORE: Calculate the similarity score for valid candidates.
//   6. SORT: Filter by the threshold, sort descending by score, and return the Suggestion array.
export function findSuggestionsForMemonic(sid: number): Suggestion[] {
    const target = getMemonicBySid(sid);
    if (!target) {
        return [];
    }

    // 2. Map all existing connections (Forward + Backward)
    const existingTargetSids = new Set<number>();
    
    // Add outgoing targets (Cards this target points to)
    for (const link of target.links) {
        existingTargetSids.add(link.targetSID);
    }
    
    // Add incoming targets (Cards that point TO this target)
    const backlinks = getBacklinks(sid);
    for (const back of backlinks) {
        existingTargetSids.add(back.sid);
    }

    // 3 & 4 & 5. Sweep, filter, and score
    const suggestions: Suggestion[] = [];
    const allMemonics = getAllMemonics();

    for (const other of allMemonics) {
        // Skip self
        if (other.sid === target.sid) continue;
        
        // Skip already linked (in either direction)
        if (existingTargetSids.has(other.sid)) continue;

        // Calculate score
        const score = calculateSimilarityScore(target, other);

        // 6. Threshold check
        if (score >= SUGGESTION_THRESHOLD) {
            suggestions.push({ targetSid: other.sid, score });
        }
    }

    // 6. Sort descending (highest score first)
    return suggestions.sort((a, b) => b.score - a.score);
}

// ========== 6. MAIN / EXPORTS ==========
// (Functions are exported inline above)