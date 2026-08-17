// ─────────────────────────────────────────────────────────────────────────────
// The ONLY file that knows both shapes: parser wire documents ⇄ engine cards.
// Implements what SPEC §20 describes: renumber all sids, remap every link
// through ONE old→new table spanning the whole vault — links may cross files
// because the vault is one shipped package (§10.3) — and drop-but-REPORT links
// whose target cannot be resolved: never invent one (§10.3), never lose one
// silently. Placement policy (§22.2): the engine decides — a file's actual
// location on disk stamps `hierarchy`; in-file @hir claims are honored only
// for foreign imports (fromParsed), where the claim is all we have.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  MnemoDocument as WireDocument,
  Mnemonic as WireMnemonic,
} from "@rakz-app/mns-parser"
import type { Memonic, MnemoDocument as EngineDocument } from "./types"

export interface DroppedLink {
  from: string
  title: string
  target: string | null | undefined
}
export interface BridgeResult {
  doc: EngineDocument
  dropped: DroppedLink[]
  duplicates: string[]   // sids seen more than once across the vault (first wins)
}
export interface FileEntry {
  doc: WireDocument
  hierarchy: string      // where this file actually lives, relative to ROOT, no extension
}

// "4" → 4; missing / "potato" / out-of-range → 0. Policy, adjustable.
function toImportance(v: string | undefined): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0
}

interface Pair {
  mn: WireMnemonic
  hierarchy: string
}

// One global old→new sid table across every pair, then one mapping pass.
// Fresh copies only: engine RAM never aliases parser output.
function bridgeAll(pairs: Pair[]): BridgeResult {
  const table = new Map<string, number>()
  const duplicates: string[] = []
  pairs.forEach(({ mn }, i) => {
    if (mn.sid == null) return
    if (table.has(mn.sid)) duplicates.push(mn.sid)
    else table.set(mn.sid, i + 1)
  })

  const dropped: DroppedLink[] = []
  const memonics: Memonic[] = pairs.map(({ mn, hierarchy }, i) => ({
    sid: i + 1,
    id: mn.id ?? "",
    type: mn.type ?? "fact",
    title: mn.title,
    context: mn.context,
    importance: toImportance(mn.importance),
    status: mn.status ?? "active",
    hierarchy,
    tags: [...mn.tags],
    links: (mn.links ?? []).flatMap((l) => {
      const target = l.targetSID == null ? undefined : table.get(l.targetSID)
      if (target === undefined) {
        dropped.push({ from: mn.title, title: l.title, target: l.targetSID })
        return []
      }
      return [{ targetSID: target, title: l.title }]
    }),
  }))

  return { doc: { memonics }, dropped, duplicates }
}

// Single foreign document (drag-drop / Import Vault): honor its @hir claims.
export function fromParsed(wire: WireDocument): BridgeResult {
  return bridgeAll((wire.mnemonics ?? []).map((mn) => ({ mn, hierarchy: mn.hierarchy ?? "" })))
}

// The whole vault tree in one pass: each file's ACTUAL location stamps its
// cards, and the shared table lets links cross file boundaries.
export function fromParsedFiles(entries: FileEntry[]): BridgeResult {
  return bridgeAll(
    entries.flatMap((e) => (e.doc.mnemonics ?? []).map((mn) => ({ mn, hierarchy: e.hierarchy }))),
  )
}

// Engine → wire, for serializeToMns. Numbers become strings at the boundary.
export function toDocument(cards: Memonic[]): WireDocument {
  return {
    schemaVersion: "0.1",
    flags: [],
    hierarchy: [],
    fileNotes: [],
    closedImplicitly: false,
    mnemonics: cards.map(
      (m): WireMnemonic => ({
        title: m.title,
        context: m.context,
        id: m.id,
        type: m.type,
        importance: String(m.importance),
        status: m.status,
        sid: String(m.sid),
        hierarchy: m.hierarchy || undefined,
        tags: [...m.tags],
        keywords: [],
        notes: [],
        links: m.links
          .filter((l) => Number.isInteger(l.targetSID))
          .map((l) => ({ title: l.title, targetSID: String(l.targetSID) })),
      }),
    ),
  }
}
