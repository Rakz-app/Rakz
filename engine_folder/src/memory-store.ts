// ========== 1. IMPORTS ==========
import type { MnemoDocument, Memonic } from "./types";

// ========== 2. TYPES ==========
export interface FilterCriteria {
    id?: string;
    type?: string;
    minImportance?: number;
    tags?: string[];
    tagMatchMode?: "AND" | "OR";
}

// ========== 4. STATE ==========
// The concurrent RAM for our application
let memonics: Memonic[] = [];
let sidCounter: number = 1;

// ========== 5. LOGIC ==========

// merge a freshly parsed MnemoDocument into the live session's store, shifting
// its sids so they never collide with whatever is already running.
export function importDocument(doc: MnemoDocument): void {
    let fileMax = 0;
    const seenSids = new Set<number>();
    const needsNewSid: Memonic[] = [];

    for (const mnemonic of doc.memonics) {
        if (Number.isInteger(mnemonic.sid) && mnemonic.sid > 0 && !seenSids.has(mnemonic.sid)) {
            seenSids.add(mnemonic.sid);
            fileMax = Math.max(fileMax, mnemonic.sid);
        } else {
            needsNewSid.push(mnemonic);
        }
    }

    for (const mnemonic of needsNewSid) {
        fileMax++;
        mnemonic.sid = fileMax;
    }

    const offset = sidCounter - 1;

    for (const mnemonic of doc.memonics) {
        mnemonic.sid = mnemonic.sid + offset;
        for (const link of mnemonic.links) {
            if (Number.isInteger(link.targetSID) && link.targetSID > 0) {
                link.targetSID = link.targetSID + offset;
            }
        }
    }

    memonics.push(...doc.memonics);
    sidCounter = offset + fileMax + 1;
}

// safely mints a new, permanently unique integer for new cards.
export function generateSid(): number {
    return sidCounter++;
}

// Returns a shallow copy of the active cards for the UI to display.
export function getAllMemonics(): Memonic[] {
    return [...memonics];
}

// Returns a refined list of mnemonics based on multiple optional criteria.
export function filterMemonics(criteria: FilterCriteria): Memonic[] {
    return memonics.filter(mnemo => {
        if (criteria.id !== undefined && mnemo.id !== criteria.id) {
            return false;
        }
        if (criteria.type !== undefined) {
            if (!mnemo.type || mnemo.type.toLowerCase() !== criteria.type.toLowerCase()) {
                return false;
            }
        }
        if (criteria.minImportance !== undefined) {
            if (mnemo.importance === undefined || mnemo.importance < criteria.minImportance) {
                return false;
            }
        }
        if (criteria.tags && criteria.tags.length > 0) {
            const targetTags = criteria.tags.map(t => t.toLowerCase());
            const cardTags = mnemo.tags.map(t => t.toLowerCase());
            const mode = criteria.tagMatchMode || "AND";
            if (mode === "AND") {
                const hasAll = targetTags.every(target => cardTags.includes(target));
                if (!hasAll) return false;
            } else {
                const hasAny = targetTags.some(target => cardTags.includes(target));
                if (!hasAny) return false;
            }
        }
        return true;
    });
}

// Fetches a specific card using the hidden, immutable system ID.
export function getMemonicBySid(sid: number): Memonic | undefined {
    return memonics.find(mnemo => mnemo.sid === sid);
}

// Safely appends a new mnemonic to the active RAM array.
export function addMemonic(memonic: Memonic): void {
    memonics.push(memonic);
}

// removes a mnemonic from RAM by its sid. LOW-LEVEL — use link-engine's
// deleteMemonicSafely() to also sweep dangling links.
export function deleteMemonic(sid: number): void {
    memonics = memonics.filter(mnemo => mnemo.sid !== sid);
}

// apply a partial edit to an existing mnemonic (NOT sid/links/tags).
export function updateMemonic(sid: number, updates: Omit<Partial<Memonic>, "sid" | "links" | "tags">): Memonic | undefined {
    const target = getMemonicBySid(sid);
    if (!target) {
        return undefined;
    }
    Object.assign(target, updates);
    return target;
}

// append a single tag to a mnemonic, avoiding duplicates.
export function addTag(sid: number, tag: string): void {
    const target = getMemonicBySid(sid);
    if (!target) return;
    const normalizedTag = tag.trim();
    if (normalizedTag === "") return;
    const alreadyExists = target.tags.some(t => t.toLowerCase() === normalizedTag.toLowerCase());
    if (!alreadyExists) {
        target.tags.push(normalizedTag);
    }
}

// remove a single tag from a mnemonic, if present.
export function removeTag(sid: number, tag: string): void {
    const target = getMemonicBySid(sid);
    if (!target) return;
    target.tags = target.tags.filter(t => t.toLowerCase() !== tag.toLowerCase());
}
