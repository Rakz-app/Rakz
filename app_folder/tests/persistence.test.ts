// Persistence contracts — file grouping, safe paths, and locateCard matching
// the SAME serializer the saver uses (HANDOFF §3 invariant 5).
import { describe, expect, it, vi } from "vitest";

// Fresh module state per test — the engine store is a module singleton.
async function fresh() {
  vi.resetModules();
  const engine = await import("@engine/memory-store");
  const persistence = await import("../src/composables/library/persistence");
  const state = await import("../src/composables/library/state");
  return { engine, persistence, state };
}

const card = (sid: number, id: string, hierarchy: string, title: string) => ({
  sid, id, type: "fact", title, context: "ctx", importance: 3, status: "active", hierarchy, tags: [], links: [],
});

describe("sanitizeHir / fileNameFor", () => {
  it("maps a hierarchy to a safe relative .mns path", async () => {
    const { persistence } = await fresh();
    expect(persistence.sanitizeHir("science/physics")).toBe("science/physics");
    expect(persistence.fileNameFor(card(1, "Physics", "science/physics", "t"))).toBe("science/physics.mns");
  });

  it("rejects traversal and unsafe segments", async () => {
    const { persistence } = await fresh();
    expect(persistence.sanitizeHir("../escape")).toBe("escape");
    expect(persistence.sanitizeHir("a/../../b")).toBe("a/b");
    expect(persistence.sanitizeHir("we:ird*name?")).toBe("we-ird-name-");
  });

  it("falls back to subject id, then 'vault', when no hierarchy", async () => {
    const { persistence } = await fresh();
    expect(persistence.fileNameFor(card(1, "Physics", "", "t"))).toBe("Physics.mns");
    expect(persistence.fileNameFor(card(1, "", "", "t"))).toBe("vault.mns");
  });

  it("groups cards by file exactly as the saver does", async () => {
    const { persistence } = await fresh();
    const cards = [card(1, "A", "x", "1"), card(2, "A", "x", "2"), card(3, "B", "", "3")];
    const groups = new Map<string, number[]>();
    for (const m of cards) {
      const f = persistence.fileNameFor(m);
      groups.set(f, [...(groups.get(f) ?? []), m.sid]);
    }
    expect(Object.fromEntries(groups)).toEqual({ "x.mns": [1, 2], "B.mns": [3] });
  });
});

describe("locateCard", () => {
  it("points at the card's mn=== opener line, matching the serialized bytes", async () => {
    const { engine, persistence } = await fresh();
    engine.importDocument({ memonics: [card(1, "A", "x", "first"), card(2, "A", "x", "second"), card(3, "A", "x", "third")] });
    const loc1 = persistence.locateCard(1);
    const loc2 = persistence.locateCard(2);
    const loc3 = persistence.locateCard(3);
    expect(loc1!.file).toBe("x.mns");
    expect(loc1!.line).toBeGreaterThan(0);
    expect(loc2 && loc2.line).toBeGreaterThan(loc1!.line);
    expect(loc3 && loc3.line).toBeGreaterThan(loc2!.line);
    // the reported line must literally be a mn=== opener in the file body
    const { serializeToMns } = await import("@rakz-app/mns-parser");
    const { toDocument } = await import("@engine/bridge");
    const lines = serializeToMns(toDocument(engine.getAllMemonics())).split("\n");
    expect(lines[loc2!.line - 1]).toBe("mn===");
  });

  it("returns null for an unknown sid", async () => {
    const { persistence } = await fresh();
    expect(persistence.locateCard(999)).toBeNull();
  });
});

describe("dedupeExactClones healer", () => {
  it("removes exact duplicates (no links) but keeps originals and linked cards", async () => {
    const { engine, state } = await fresh();
    // the real-world duplication: same content, DIFFERENT sids (bridged twice)
    const dup = card(1, "A", "", "same");
    const dupAgain = card(2, "A", "", "same");
    engine.importDocument({ memonics: [dup, dupAgain, { ...card(3, "A", "", "same"), links: [{ targetSID: 1, title: "r" }] }] });
    const removed = state.dedupeExactClones();
    expect(removed).toBe(1);
    const left = engine.getAllMemonics();
    expect(left).toHaveLength(2);
    expect(left.some((m) => m.links.length > 0)).toBe(true);
  });
});
