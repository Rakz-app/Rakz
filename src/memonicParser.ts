import { Memonic, MemonicType, MemonicStrength } from "./types";
import {
  addMemonic,
  getAllMemonics,
  getMemonicBySid,
  updateMemonicBySid,
  generateSid,
} from "./memoryStore";

const MEMONIC_CALLOUT_REGEX = /^>\s*\[!(memonic)\|?([a-zA-Z]*)\]\s*(.+)$/i;
const META_LINE_REGEX =
  /^>\s*(id|sid|strength|tags|triggers|model|summary)\s*:\s*(.+)$/i;
const SEPARATOR_REGEX = /^>\s*---\s*$/;
// Legacy form of the system id, kept only for backward compatibility: older
// notes embedded it as an HTML comment (`> <!-- sid: 12 -->`). New callouts
// write a visible `> sid: N` meta line instead (see META_LINE_REGEX).
const SID_COMMENT_REGEX = /^>\s*<!--\s*sid:\s*(\d+)\s*-->\s*$/i;

export interface ParsedMemonic {
  customId: string | null;
  sid: number | null;
  title: string;
  type: MemonicType;
  strength: MemonicStrength;
  tags: string[];
  triggerKeywords: string[];
  summary: string;
  model: string;
  context: string;
  raw: string;
}

export interface ConflictInfo {
  title: string;
  requestedId: string;
  existingOwner: string;
  existingTitle: string;
  stolenFrom?: {
    id: string;
    sourceFile: string;
    bid: number;
  };
}

export function parseCalloutMemonics(lines: string[]): ParsedMemonic[] {
  const results: ParsedMemonic[] = [];

  let current: Partial<ParsedMemonic> | null = null;
  let inContext = false;
  let inRef = false;
  const contextLines: string[] = [];

  function flushCurrent() {
    if (!current || !current.title) return;
    current.context = contextLines.join("\n").trim();
    current.raw = `[!memonic|${current.type}] ${current.title}`;
    results.push(current as ParsedMemonic);
    current = null;
  }

  function startNew(): Partial<ParsedMemonic> {
    return {
      customId: null,
      sid: null,
      tags: [],
      triggerKeywords: [],
      strength: 3,
      type: "shortcut",
      summary: "",
      model: "openai/gpt-4o-mini",
      context: "",
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```memonic-ref/.test(line)) {
      if (current) flushCurrent();
      inRef = true;
      continue;
    }
    if (inRef) {
      if (/^\s*```\s*$/.test(line)) inRef = false;
      continue;
    }

    const calloutMatch = line.match(MEMONIC_CALLOUT_REGEX);

    if (calloutMatch) {
      if (current) flushCurrent();
      current = startNew();
      inContext = false;
      contextLines.length = 0;
      current.type = (calloutMatch[2] || "shortcut") as MemonicType;
      current.title = calloutMatch[3].trim();
      continue;
    }

    if (!current) continue;

    if (SEPARATOR_REGEX.test(line)) {
      inContext = true;
      continue;
    }

    if (!inContext) {
      const sidMatch = line.match(SID_COMMENT_REGEX);
      if (sidMatch) {
        current.sid = parseInt(sidMatch[1]);
        continue;
      }
    }

    const metaMatch = line.match(META_LINE_REGEX);
    if (metaMatch && !inContext) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();

      switch (key) {
        case "id":
          current.customId = value;
          break;
        case "sid":
          current.sid = parseInt(value) || null;
          break;
        case "strength":
          current.strength = Math.min(
            5,
            Math.max(1, parseInt(value) || 3),
          ) as MemonicStrength;
          break;
        case "tags":
          current.tags = value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          break;
        case "triggers":
          current.triggerKeywords = value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          break;
        case "summary":
          current.summary = value;
          break;
        case "model":
          current.model = value;
          break;
      }
      continue;
    }

    // A quoted line that isn't a recognized meta line is content. When there is
    // no explicit "> ---" separator, auto-enter context mode (most forgiving).
    if (/^>/.test(line)) {
      inContext = true;
      contextLines.push(line.replace(/^>\s?/, ""));
    } else if (inContext) {
      // First non-quoted line ends the callout block.
      flushCurrent();
      inContext = false;
    }
  }

  if (current) flushCurrent();

  return results;
}

function getUsedNumericIds(): Set<number> {
  const used = new Set<number>();
  for (const m of getAllMemonics()) {
    const match = m.id.match(/^mem[-_](\d+)$/);
    if (match) used.add(parseInt(match[1]));
  }
  return used;
}

export function findSmallestFreeNumericId(): number {
  const used = getUsedNumericIds();
  let next = 1;
  while (used.has(next)) next++;
  return next;
}

function createMemonicFromParsed(
  filePath: string,
  parsed: ParsedMemonic,
  existingInFile: Memonic[],
): { memonic: Memonic; conflict: ConflictInfo | null } {
  const folderPath = "/" + filePath.split("/").slice(0, -1).join("/");

  let id: string;
  let conflict: ConflictInfo | null = null;

  const sameTitle = existingInFile.find(
    (m) => m.title.trim().toLowerCase() === parsed.title.trim().toLowerCase(),
  );

  // Identity is decided solely by the hidden `sid`. The visible `id` is a
  // user-facing label that may be edited freely and may be shared by several
  // memonics, so there is no id-ownership/conflict resolution here anymore.
  if (parsed.customId) {
    id = `mem-${parsed.customId}`;
  } else if (sameTitle) {
    id = sameTitle.id;
  } else {
    // No visible id supplied (e.g. auto-id disabled); leave it empty.
    id = "";
  }

  const sid = parsed.sid ?? generateSid();
  const now = Date.now();

  return {
    memonic: {
      id,
      title: parsed.title,
      type: parsed.type,
      context: parsed.context,
      strength: parsed.strength,
      source: { type: "user" },
      status: "active",
      sid,
      bid: sid,
      tags: parsed.tags,
      summary: parsed.summary,
      folderPath,
      sourceFile: filePath,
      aiConfig: {
        providerId: "openrouter",
        model: parsed.model,
      },
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      suggestionBehavior: {
        triggerMode: "hybrid",
        triggerKeywords: parsed.triggerKeywords,
        promptTemplates: [
          {
            id: "default",
            label: "Explain",
            template: `Using this context: {{context}}\n\nRespond to: {{noteContent}}`,
          },
        ],
        priority: 3,
      },
    },
    conflict,
  };
}

export function scanNoteForMemonics(
  fileContent: string,
  filePath: string,
  seenSids?: Set<number>,
): void {
  const lines = fileContent.split("\n");
  const parsedList = parseCalloutMemonics(lines);

  const folderPath = "/" + filePath.split("/").slice(0, -1).join("/");
  const existingInFile = getAllMemonics().filter(
    (m) => m.sourceFile === filePath,
  );
  const processedSids = new Set<number>();

  for (const parsed of parsedList) {
    // Remember whether this callout ARRIVED with a sid. Identity is sid-only:
    // a callout that already carries a sid is its own memonic and must never be
    // merged into a different one that happens to share the same visible id —
    // that silent merge is exactly what used to block duplicate ids.
    const hadEmbeddedSid = parsed.sid != null;
    let parsedSid = parsed.sid;

    // During a full vault scan, encountering the same sid twice means this
    // callout is a COPY of another one. Force the copy to mint a brand-new
    // identity (a fresh sid) while keeping its visible id, so the two coexist
    // as separate memonics that simply share the same id (duplicates allowed).
    if (parsedSid != null && seenSids) {
      if (seenSids.has(parsedSid)) {
        parsedSid = null;
      } else {
        seenSids.add(parsedSid);
      }
    }
    // Keep parsed.sid in sync: a detected copy (sid cleared above) mints a
    // fresh identity, while a genuinely new callout preserves its embedded sid.
    parsed.sid = parsedSid;

    // 1) Resolve identity by the stable system id first.
    let target = parsedSid != null ? getMemonicBySid(parsedSid) : undefined;

    // 2) Fallback ONLY for callouts that NEVER had a sid (hand-typed by the
    //    user, or authored before the dual-identity system): match an explicit
    //    id, then a same-title callout within this file. Callouts that already
    //    carry a sid — including freshly inserted ones not yet in the store and
    //    detected copies — keep their own identity and are NEVER matched by id,
    //    so two memonics may freely share the same visible id.
    if (!target && !hadEmbeddedSid) {
      if (parsed.customId) {
        const reqId = `mem-${parsed.customId}`;
        target = existingInFile.find((m) => m.id === reqId);
      }
      if (!target) {
        target = existingInFile.find(
          (m) =>
            m.title.trim().toLowerCase() === parsed.title.trim().toLowerCase(),
        );
      }
    }

    if (target) {
      // Existing identity → update in place. Transparently handles title
      // renames, visible-id edits, content edits, and file moves.
      const updates: Partial<Memonic> = {
        title: parsed.title,
        type: parsed.type,
        context: parsed.context,
        strength: parsed.strength,
        tags: parsed.tags,
        summary: parsed.summary,
        aiConfig: { providerId: "openrouter", model: parsed.model },
        suggestionBehavior: {
          ...target.suggestionBehavior,
          triggerKeywords: parsed.triggerKeywords,
        },
        sourceFile: filePath,
        folderPath,
        status: "active",
      };
      if (parsed.customId) {
        updates.id = `mem-${parsed.customId}`;
      }
      updateMemonicBySid(target.sid, updates);
      processedSids.add(target.sid);
    } else {
      // Brand-new callout → mint a fresh identity (sid is set inside
      // createMemonicFromParsed; bid is assigned here).
      const { memonic } = createMemonicFromParsed(
        filePath,
        parsed,
        existingInFile,
      );
      // bid mirrors sid (set in createMemonicFromParsed); no vault-derived
      // counter is used anymore.
      addMemonic(memonic);
      processedSids.add(memonic.sid);
    }
  }

  // 3) Any active memonic previously sourced from this file whose callout is
  //    gone is moved to trash (status "deleted"), matching manual deletion.
  //    Re-adding the callout reactivates it via its sid (undo / paste-back).
  for (const m of existingInFile) {
    if (!processedSids.has(m.sid) && m.status === "active") {
      updateMemonicBySid(m.sid, { status: "deleted" });
    }
  }
}

/**
 * Model A id-deduplication. When the same visible id is held by more than one
 * ACTIVE memonic (e.g. a callout copied into another note), the newest (highest
 * bid) stays active and the older ones are ARCHIVED — never deleted. Stable
 * across rescans because bid never changes. Call after a full vault scan.
 */
export function resolveIdDuplicates(
  onConflict?: (conflict: ConflictInfo) => void,
): void {
  const groups = new Map<string, Memonic[]>();
  for (const m of getAllMemonics()) {
    if (m.status !== "active") continue;
    const list = groups.get(m.id);
    if (list) list.push(m);
    else groups.set(m.id, [m]);
  }

  for (const [id, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.bid - a.bid);
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      const loser = group[i];
      updateMemonicBySid(loser.sid, { status: "archived" });
      onConflict?.({
        title: loser.title,
        requestedId: id,
        existingOwner: keep.sourceFile || "unknown",
        existingTitle: keep.title,
      });
    }
  }
}

/**
 * Persist auto-assigned numeric ids back into a note's memonic callouts when
 * they have no explicit `> id:` line. This keeps a memonic's identity (and its
 * bid) stable even if the user later renames the callout title.
 *
 * Call this AFTER scanNoteForMemonics so the store already holds the assigned
 * ids. Used by the manual full vault scan only.
 */
export function writeBackMissingIds(
  fileContent: string,
  filePath: string,
): { content: string; changed: boolean } {
  const memonicsInFile = getAllMemonics().filter(
    (m) => m.sourceFile === filePath && m.status === "active",
  );
  if (memonicsInFile.length === 0) {
    return { content: fileContent, changed: false };
  }

  const lines = fileContent.split("\n");
  const out: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);

    const calloutMatch = line.match(MEMONIC_CALLOUT_REGEX);
    if (!calloutMatch) continue;

    const title = calloutMatch[3].trim();

    // Inspect only the contiguous metadata region right after the header
    // (before the separator or before any context line) to detect an id.
    let hasId = false;
    let hasSid = false;
    for (let j = i + 1; j < lines.length && /^>/.test(lines[j]); j++) {
      if (SEPARATOR_REGEX.test(lines[j])) break;
      if (SID_COMMENT_REGEX.test(lines[j])) {
        hasSid = true;
        continue;
      }
      const meta = lines[j].match(META_LINE_REGEX);
      if (!meta) break; // context started — stop scanning the metadata region
      if (meta[1].toLowerCase() === "id") {
        hasId = true;
      }
      if (meta[1].toLowerCase() === "sid") {
        hasSid = true;
      }
    }

    const match = memonicsInFile.find(
      (m) => m.title.trim().toLowerCase() === title.toLowerCase(),
    );
    if (!match) continue;

    // Persist only the hidden, stable system id so identity survives later
    // edits (rename, visible-id change, file move). The visible `id` is now
    // user-controlled and optional, so it is never injected automatically.
    if (!hasSid && match.sid) {
      out.push(`> <!-- sid: ${match.sid} -->`);
      changed = true;
    }
  }

  return { content: out.join("\n"), changed };
}
