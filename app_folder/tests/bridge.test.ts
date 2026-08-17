// Bridge contracts — the rules that keep cross-file links alive and never
// lose data silently (SPEC §20 / §22.2, HANDOFF §3).
import { describe, expect, it } from "vitest";

import { fromParsed, fromParsedFiles, toDocument } from "@engine/bridge";
import type { MnemoDocument as WireDocument } from "@rakz-app/mns-parser";

/** Minimal wire document helper. */
function wire(mnemonics: WireDocument["mnemonics"]): WireDocument {
  return { schemaVersion: "0.1", flags: [], hierarchy: [], fileNotes: [], closedImplicitly: false, mnemonics };
}

describe("bridge.fromParsedFiles", () => {
  it("renumbers sids densely 1..N across the whole vault", () => {
    const a = wire([{ title: "A", context: "", tags: [], keywords: [], notes: [], links: [], sid: "41" }]);
    const b = wire([{ title: "B", context: "", tags: [], keywords: [], notes: [], links: [], sid: "7" }]);
    const { doc } = fromParsedFiles([
      { doc: a, hierarchy: "math" },
      { doc: b, hierarchy: "bio/cells" },
    ]);
    expect(doc.memonics.map((m) => m.sid)).toEqual([1, 2]);
  });

  it("remaps links through the global table so they survive across files", () => {
    const a = wire([{ title: "A", context: "", tags: [], keywords: [], notes: [], links: [{ title: "r", targetSID: "99" }], sid: "1" }]);
    const b = wire([{ title: "B", context: "", tags: [], keywords: [], notes: [], links: [], sid: "99" }]);
    const { doc, dropped } = fromParsedFiles([
      { doc: a, hierarchy: "one" },
      { doc: b, hierarchy: "two" },
    ]);
    // old sid 99 lives in a DIFFERENT file — the link must still resolve to the new sid 2
    expect(doc.memonics[0]!.links).toEqual([{ targetSID: 2, title: "r" }]);
    expect(dropped).toEqual([]);
  });

  it("drops-and-reports unresolvable links instead of inventing targets", () => {
    const a = wire([{ title: "A", context: "", tags: [], keywords: [], notes: [], links: [{ title: "ghost", targetSID: "404" }], sid: "1" }]);
    const { doc, dropped } = fromParsedFiles([{ doc: a, hierarchy: "" }]);
    expect(doc.memonics[0]!.links).toEqual([]);
    expect(dropped).toEqual([{ from: "A", title: "ghost", target: "404" }]);
  });

  it("records duplicate sids (first wins) without losing the card", () => {
    const a = wire([{ title: "first", context: "", tags: [], keywords: [], notes: [], links: [], sid: "5" }]);
    const b = wire([{ title: "second", context: "", tags: [], keywords: [], notes: [], links: [], sid: "5" }]);
    const { doc, duplicates } = fromParsedFiles([
      { doc: a, hierarchy: "x" },
      { doc: b, hierarchy: "y" },
    ]);
    expect(doc.memonics).toHaveLength(2);
    expect(duplicates).toEqual(["5"]);
  });

  it("stamps each card with its file's ACTUAL disk location, overriding in-file @hir", () => {
    const a = wire([{ title: "A", context: "", tags: [], keywords: [], notes: [], links: [], hierarchy: "claimed-inside", sid: "1" }]);
    const { doc } = fromParsedFiles([{ doc: a, hierarchy: "real/disk/path" }]);
    expect(doc.memonics[0]!.hierarchy).toBe("real/disk/path");
  });
});

describe("bridge.fromParsed", () => {
  it("honors in-file @hir claims for foreign imports (the claim is all we have)", () => {
    const a = wire([{ title: "A", context: "", tags: [], keywords: [], notes: [], links: [], hierarchy: "imported/kit", sid: "1" }]);
    const { doc } = fromParsed(a);
    expect(doc.memonics[0]!.hierarchy).toBe("imported/kit");
  });
});

describe("bridge.toDocument", () => {
  it("stringifies numbers at the wire boundary (sid, importance, targetSID)", () => {
    const { doc } = fromParsedFiles([
      { doc: wire([{ title: "A", context: "", tags: [], keywords: [], notes: [], links: [{ title: "r", targetSID: "2" }], sid: "1" }, { title: "B", context: "", tags: [], keywords: [], notes: [], links: [], sid: "2" }]), hierarchy: "" },
    ]);
    const wireBack = toDocument(doc.memonics);
    expect(wireBack.mnemonics[0]!.sid).toBe("1");
    expect(wireBack.mnemonics[0]!.importance).toBe("0");
    expect(wireBack.mnemonics[0]!.links![0]!.targetSID).toBe("2");
  });
});
