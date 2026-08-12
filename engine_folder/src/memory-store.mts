// ========== 1. IMPORTS ==========
import type { MnemoDocument, Memonic } from "@rakz-app/mns-parser";

// ========== 2. TYPES ==========
export interface FilterCriteria {
    id?: string;
    type?: string;
    minImportance?: number;
    tags?: string[];
    tagMatchMode?: "AND" | "OR"; 
}

// ========== 3. CONSTANTS ==========
// (None required for this file)

// ========== 4. STATE ==========
// The concurrent RAM for our application
let memonics: Memonic[] = [];
let sidCounter: number = 1; 

// ========== 5. LOGIC ==========

// ----- importDocument -----
// purpose: merge a freshly parsed MnemoDocument into the live session's
//          store, shifting its sids so they never collide with whatever
//          is already running. Works identically for the very first
//          load (offset is 0 when the store is empty) and any later
//          import — no separate code path needed for either case.
// io: in → doc (MnemoDocument) | out → void (mutates mnemonics, nextSid)
// processes:
//   1. SANITIZATION 1: Sweep the document to lock in valid SIDs and isolate duplicates/missing ones.
//   2. SANITIZATION 2: Mint fresh, sequential SIDs for any broken cards based on the file's local max.
//   3. OFFSET CALCULATION: offset = sidCounter - 1 (determines the universal shift amount).
//   4. SHIFTING: Add the offset to every mnemonic's SID and every valid link's targetSID.
//   5. STORAGE: Append all the perfectly sanitized and shifted mnemonics into live RAM.
//   6. SECURE COUNTER: Update sidCounter = offset + fileMax + 1 to anchor it safely above the new data.
export function importDocument(doc: MnemoDocument): void {
    let fileMax = 0;
    const seenSids = new Set<number>();
    const needsNewSid: Memonic[] = [];

    // 1. SANITIZATION SWEEP 1: Separate the good from the bad
    for (const mnemonic of doc.memonics) {
        // If it's a valid number AND we haven't seen it yet, it's safe!
        if (Number.isInteger(mnemonic.sid) && mnemonic.sid > 0 && !seenSids.has(mnemonic.sid)) {
            seenSids.add(mnemonic.sid);
            fileMax = Math.max(fileMax, mnemonic.sid);
        } else {
            // It's either missing (undefined/string) or a duplicate of an SID we already logged
            needsNewSid.push(mnemonic);
        }
    }

    // 2. SANITIZATION SWEEP 2: Fix the broken cards
    for (const mnemonic of needsNewSid) {
        fileMax++; // Mint a brand new highest ID for this specific file
        mnemonic.sid = fileMax;
    }

    // 3. APPLY OFFSET: The file is now pristine, proceed as normal!
    const offset = sidCounter - 1;

    for (const mnemonic of doc.memonics) {
        mnemonic.sid = mnemonic.sid + offset;
        
        for (const link of mnemonic.links) {
            // Ensure targetSID exists before trying to shift it
            if (Number.isInteger(link.targetSID) && link.targetSID > 0) {
                link.targetSID = link.targetSID + offset;
            }
        }
    }

    // 4. PUSH & SECURE
    memonics.push(...doc.memonics);
    sidCounter = offset + fileMax + 1;
}

// ----- generateSid -----
// purpose: safely mints a new, permanently unique integer for new cards 
//          by incrementing sidCounter by 1 every time it is called.
// io: in --> void | out --> number
// processes:
//   1. INCREMENT: Output the current value of the internal counter, then increment it by 1 for the next call.
export function generateSid(): number {
    // Returns the current value of the counter, THEN increments it by 1
    return sidCounter++;
}

// ----- getAllMemonics -----
// purpose: Returns a copy of the active cards for the UI to display.
// io: in --> void | out --> Memonic[]
// processes:
//   1. COPY: Generate and return a shallow copy of the active RAM array to prevent external code from mutating state.
export function getAllMemonics(): Memonic[] {
    // Returns a copy of the RAM array to protect the internal state,
    // preventing external code from mutating it directly.
    return [...memonics];
}

// ----- filterMemonics -----
// purpose: Returns a refined list of mnemonics based on multiple optional criteria.
// io: in -> criteria (FilterCriteria) | out -> Memonic[]
// processes:
//   1. SWEEP: Iterate over the active RAM array using .filter().
//   2. WATERFALL: Check each criterion one by one. If a card fails, immediately return false.
//   3. RETURN: Output the safely copied array of surviving cards.
export function filterMemonics(criteria: FilterCriteria): Memonic[] {
    return memonics.filter(mnemo => {
        // 1. Check ID (Exact match, safely handles empty strings)
        if (criteria.id !== undefined && mnemo.id !== criteria.id) {
            return false;
        }

        // 2. Check Type (Case-insensitive match, safely handles empty strings)
        if (criteria.type !== undefined) {
            if (!mnemo.type || mnemo.type.toLowerCase() !== criteria.type.toLowerCase()) {
                return false;
            }
        }

        // 3. Check Importance (Threshold, safely handles 0)
        if (criteria.minImportance !== undefined) {
            if (mnemo.importance === undefined || mnemo.importance < criteria.minImportance) {
                return false;
            }
        }

        // 4. Check Tags (Case-insensitive, dynamic AND/OR logic)
        if (criteria.tags && criteria.tags.length > 0) {
            const targetTags = criteria.tags.map(t => t.toLowerCase());
            const cardTags = mnemo.tags.map(t => t.toLowerCase());
            
            // Default to AND logic if the UI doesn't specify
            const mode = criteria.tagMatchMode || "AND"; 

            if (mode === "AND") {
                // Card must contain ALL target tags
                const hasAll = targetTags.every(target => cardTags.includes(target));
                if (!hasAll) return false;
            } else {
                // Card must contain AT LEAST ONE target tag
                const hasAny = targetTags.some(target => cardTags.includes(target));
                if (!hasAny) return false;
            }
        }

        // 5. Survival! If it didn't trip any of the 'return false' traps, it passes.
        return true;
    });
}

// ----- getMemonicBySid -----
// purpose: Fetches a specific card using the hidden, immutable system ID.
// io: in --> sid (number) | out --> Memonic | undefined
// processes:
//   1. SEARCH: Sweep the RAM array and return the first mnemonic matching the provided sid.
export function getMemonicBySid(sid: number): Memonic | undefined {
    // Searches the array and returns the first card that matches the SID
    return memonics.find(mnemo => mnemo.sid === sid);
}

// ----- addMemonic -----
// purpose: Safely appends a new mnemonic to the active RAM array. Notice that whoever calls this function has to first explicitly call generateSid() to mint
// a unique sid for the new card, then pass it in as part of the Memonic object.
// This is a deliberate design choice to keep the sid generation logic centralized and avoid accidental collisions.
// io: in --> mnemonic (Memonic) | out --> void (mutates module state)
// processes:
//   1. APPEND: Push the fully constructed mnemonic object directly to the end of the RAM array.
export function addMemonic(memonic: Memonic): void {
    // Appends the fully constructed card directly to the end of the RAM array
    memonics.push(memonic);
}

// ----- deleteMemonic -----
// purpose: removes a mnemonic from RAM by its sid. LOW-LEVEL PRIMITIVE —
//          does NOT clean up other mnemonics' links that target this one.
//          Callers should use link-engine's deleteMemonicSafely() instead,
//          which sweeps dangling links before calling this.
// io: in → sid (number) | out → void (mutates module state)
// processes:
//   1. FILTER: Reassign the RAM array, keeping only mnemonics whose sid does not match the target.
export function deleteMemonic(sid: number): void {
    // Reassigns the RAM array to a new array that excludes the target SID
    memonics = memonics.filter(mnemo => mnemo.sid !== sid);
}

// ----- updateMemonic -----
// purpose: apply a partial edit to an existing mnemonic (title, type,
//          context, importance, status, id — anything except sid/links/tags,
//          which are structurally protected from this function)
// io: in  -> sid (number), updates (Omit<Partial<Memonic>, "sid" | "links" | "tags">)
//     out -> Memonic | undefined (the updated card, or undefined if sid wasn't found)
// processes:
//   1. FIND: Locate the target mnemonic in RAM by its sid.
//   2. GUARD: If the target is not found, safely return undefined.
//   3. MERGE: Apply the incoming partial updates to the existing object.
//   4. RETURN: Hand back the freshly updated mnemonic.
export function updateMemonic(sid: number, updates: Omit<Partial<Memonic>, "sid" | "links" | "tags">): Memonic | undefined {
    const target = getMemonicBySid(sid);
    if (!target) {
        return undefined;
    }

    Object.assign(target, updates);
    return target;
}

// ----- addTag -----
// purpose: append a single tag to a mnemonic, avoiding duplicates
// io: in  -> sid (number), tag (string) | out -> void
// processes:
//   1. GUARD: Fetch the target mnemonic by sid. Abort if it doesn't exist.
//   2. NORMALIZE: Trim whitespace from the incoming tag. Abort if empty.
//   3. DEDUPLICATE: Check existing tags case-insensitively. Abort if a match is found.
//   4. APPEND: Push the clean, normalized tag into the mnemonic's tags array.
export function addTag(sid: number, tag: string): void {
    const target = getMemonicBySid(sid);
    if (!target) {
        return;
    }

    const normalizedTag = tag.trim();
    if (normalizedTag === "") {
        return;
    }

    const alreadyExists = target.tags.some(t => t.toLowerCase() === normalizedTag.toLowerCase());
    if (!alreadyExists) {
        target.tags.push(normalizedTag);
    }
}

// ----- removeTag -----
// purpose: remove a single tag from a mnemonic, if present
// io: in  -> sid (number), tag (string) | out -> void
// processes:
//   1. GUARD: Fetch the target mnemonic by sid. Abort if it doesn't exist.
//   2. FILTER: Reassign the tags array, keeping only tags that don't match the target string (case-insensitive).
export function removeTag(sid: number, tag: string): void {
    const target = getMemonicBySid(sid);
    if (!target) {
        return;
    }

    target.tags = target.tags.filter(t => t.toLowerCase() !== tag.toLowerCase());
}

// ========== 6. MAIN / EXPORTS ==========
// (Functions are exported inline above)