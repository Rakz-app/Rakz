// ========== 1. IMPORTS ==========
import type { Memonic } from "./types";
import { getAllMemonics, getMemonicBySid, deleteMemonic } from "./memory-store";

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

// ========== 5. LOGIC ==========

// Creates a directed edge from a source mnemonic to a target mnemonic.
export function addLink(sourceSid: number, targetSid: number, title: string): void {
    if (sourceSid === targetSid) {
        console.warn(`Link failed: Mnemonic cannot link to itself (${sourceSid}).`);
        return;
    }
    const sourceMnemonic = getMemonicBySid(sourceSid);
    const targetMnemonic = getMemonicBySid(targetSid);
    if (!sourceMnemonic || !targetMnemonic) {
        console.warn(`Link failed: Source (${sourceSid}) or Target (${targetSid}) does not exist.`);
        return;
    }
    const alreadyLinked = sourceMnemonic.links.some(link => link.targetSID === targetSid);
    if (alreadyLinked) return;
    sourceMnemonic.links.push({ targetSID: targetSid, title });
}

// Severs a specific edge from a source mnemonic to a target mnemonic.
export function removeLink(sourceSid: number, targetSid: number): void {
    const sourceMnemonic = getMemonicBySid(sourceSid);
    if (!sourceMnemonic) return;
    sourceMnemonic.links = sourceMnemonic.links.filter(link => link.targetSID !== targetSid);
}

// All mnemonics that have a link pointing TO the given sid.
export function getBacklinks(targetSid: number): Memonic[] {
    const allMemonics = getAllMemonics();
    return allMemonics.filter(mnemonic =>
        mnemonic.links.some(link => link.targetSID === targetSid)
    );
}

// Safe removal of a node from the graph: sweep dangling links, then erase.
export function deleteMemonicSafely(sid: number): void {
    const incomingCards = getBacklinks(sid);
    for (const card of incomingCards) {
        removeLink(card.sid, sid);
    }
    deleteMemonic(sid);
}

// score how related two mnemonics are, based on shared tags, type, and id.
export function calculateSimilarityScore(a: Memonic, b: Memonic): number {
    const aTags = a.tags.map(t => t.toLowerCase());
    const bTags = b.tags.map(t => t.toLowerCase());
    const sharedTagCount = aTags.filter(tag => bTags.includes(tag)).length;
    let totalScore = sharedTagCount * TAG_WEIGHT;
    if (a.type === b.type) {
        totalScore += TYPE_WEIGHT;
    }
    if (a.id && b.id && a.id === b.id) {
        totalScore += ID_WEIGHT;
    }
    return totalScore;
}

// scan the whole store for mnemonics related to the given one, returning any
// pairing whose score clears the threshold and isn't already linked.
export function findSuggestionsForMemonic(sid: number): Suggestion[] {
    const target = getMemonicBySid(sid);
    if (!target) return [];

    const existingTargetSids = new Set<number>();
    for (const link of target.links) {
        existingTargetSids.add(link.targetSID);
    }
    const backlinks = getBacklinks(sid);
    for (const back of backlinks) {
        existingTargetSids.add(back.sid);
    }

    const suggestions: Suggestion[] = [];
    const allMemonics = getAllMemonics();
    for (const other of allMemonics) {
        if (other.sid === target.sid) continue;
        if (existingTargetSids.has(other.sid)) continue;
        const score = calculateSimilarityScore(target, other);
        if (score >= SUGGESTION_THRESHOLD) {
            suggestions.push({ targetSid: other.sid, score });
        }
    }
    return suggestions.sort((a, b) => b.score - a.score);
}
