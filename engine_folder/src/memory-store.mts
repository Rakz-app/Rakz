// ========== 1. IMPORTS ==========
import type { MnemoDocument, Memonic } from "@rakz-app/mns-parser";

// ========== 2. TYPES ==========
// (None required for this file)

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
export function generateSid(): number {
    // Returns the current value of the counter, THEN increments it by 1
    return sidCounter++;
}

// ----- getAllMemonics -----
// purpose: Returns a copy of the active cards for the UI to display.
// io: in --> void | out --> Memonic[]
export function getAllMemonics(): Memonic[] {
    // Returns a copy of the RAM array to protect the internal state,
    // preventing external code from mutating it directly.
    return [...memonics];
}

// ----- getMemonicBySid -----
// purpose: Fetches a specific card using the hidden, immutable system ID.
// io: in --> sid (number) | out --> Memonic | undefined
export function getMemonicBySid(sid: number): Memonic | undefined {
    // Searches the array and returns the first card that matches the SID
    return memonics.find(mnemo => mnemo.sid === sid);
}

// ----- addMemonic -----
// purpose: Safely appends a new mnemonic to the active RAM array. Notice that whoever calls this function has to first explicitly call generateSid() to mint
// a unique sid for the new card, then pass it in as part of the Memonic object.
// This is a deliberate design choice to keep the sid generation logic centralized and avoid accidental collisions.
// io: in --> mnemonic (Memonic) | out --> void (mutates module state)
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
export function deleteMemonic(sid: number): void {
    // Reassigns the RAM array to a new array that excludes the target SID
    memonics = memonics.filter(mnemo => mnemo.sid !== sid);
}

// ========== 6. MAIN / EXPORTS ==========
// (Functions are exported inline above)