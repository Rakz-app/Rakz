// ─────────────────────────────────────────────────────────────────────────────
// Engine-owned domain types — the engine's internal contract, independent of
// the wire format. The parser's types describe a FILE (values as written:
// strings, optionals); these describe RAM (numbers, required). Conversion
// between the two lives in bridge.ts and nowhere else.
// ─────────────────────────────────────────────────────────────────────────────

export interface Link {
  targetSID: number
  title: string
}

export interface Memonic {
  sid: number            // system id, minted by generateSid() — immutable
  id: string             // user-facing concept/subject id — strong link signal
  type: string           // 'fact' | 'rule' | 'story' | …
  title: string
  context: string
  importance: number     // 0..5 — rendered as strength stars
  status: string         // e.g. 'active' | 'inactive'
  hierarchy: string      // @hir path — which vault file/folder this card lives in ('' = by subject)
  tags: string[]
  links: Link[]
}

export interface MnemoDocument {
  memonics: Memonic[]
}
