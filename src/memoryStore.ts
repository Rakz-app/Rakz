import { Memonic, MemonicType, MemonicStrength } from "./types";
import { findSmallestFreeNumericId } from "./memonicParser";

let memonics: Memonic[] = [];

let sidIndex = new Map<number, Memonic>();
let sidIndexDirty = true;

// Monotonic, vault-lifetime counter for the stable system id (sid). It is
// persisted in settings (nextSid) and only ever increases: deleting memonics
// never lowers it, so a freshly created memonic always gets a brand-new number
// that no past memonic has ever used. The visible `id` (mem-N) may repeat
// across a duplicate pair, so sid is the unique internal key.
let nextSidAllocator: (() => number) | null = null;

let saveCallback: (() => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Debounce disk writes so a burst of store mutations (e.g. a vault scan)
// coalesces into a single save instead of writing on every change.
function scheduleSave(): void {
  if (!saveCallback) return;
  if (saveTimer) clearTimeout(saveTimer);
  sidIndexDirty = true;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (saveCallback) saveCallback();
  }, 400);
}

export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (saveCallback) saveCallback();
}

export function initMemonicStore(
  initialData: Memonic[],
  onSave: () => void,
  getNextSid: () => number,
): void {
  memonics = initialData;
  saveCallback = onSave;
  nextSidAllocator = getNextSid;

  // Backfill stable monotonic sids for any legacy memonics saved before the
  // dual-identity system existed.
  let migrated = false;
  for (const m of memonics) {
    if (!m.sid) {
      m.sid = generateSid();
      migrated = true;
    }
    if (!Array.isArray(m.tags)) {
      m.tags = [];
      migrated = true;
    }
    if (!m.aiConfig) {
      m.aiConfig = { providerId: "openrouter", model: "" };
      migrated = true;
    }
  }
  if (migrated) scheduleSave();
  sidIndexDirty = true;
}

export function getAllMemonics(): Memonic[] {
  return [...memonics];
}

export function setAllMemonics(data: Memonic[]): void {
  for (const m of data) {
    if (!Array.isArray(m.tags)) m.tags = [];
    if (!m.aiConfig) m.aiConfig = { providerId: "openrouter", model: "" };
  }
  memonics = data;
  scheduleSave();
}

export function getMemonicById(id: string): Memonic | undefined {
  return memonics.find((m) => m.id === id);
}

// --- sid-keyed accessors --------------------------------------------------
// The visible `id` can repeat across a duplicate pair (one active, one
// archived), so it is no longer a safe store key. All identity-sensitive
// mutations target the stable, unique `sid` instead.

export function generateSid(): number {
  // Pull the next value from the persisted, monotonic counter (settings.nextSid)
  // and persist the advance. It is independent of the sids currently in the
  // store: it never looks at the highest or lowest existing sid, only at its own
  // saved counter, so a deleted number is never reused.
  if (nextSidAllocator) {
    const sid = nextSidAllocator();
    scheduleSave();
    return sid;
  }
  // Safety net for the (practically impossible) case of minting before the
  // store is initialized: stay above any existing sid to avoid a collision.
  return memonics.reduce((mx, m) => Math.max(mx, m.sid || 0), 0) + 1;
}

export function getMemonicBySid(sid: number): Memonic | undefined {
  if (sidIndexDirty) {
    sidIndex = new Map(memonics.map((m) => [m.sid, m]));
    sidIndexDirty = false;
  }
  return sidIndex.get(sid);
}

export function updateMemonicBySid(
  sid: number,
  updates: Partial<Memonic>,
): void {
  const index = memonics.findIndex((m) => m.sid === sid);
  if (index !== -1) {
    memonics[index] = { ...memonics[index], ...updates, updatedAt: Date.now() };
    scheduleSave();
  }
}

export function deleteMemonicBySid(sid: number): void {
  memonics = memonics.filter((m) => m.sid !== sid);
  scheduleSave();
}

export function incrementUsageBySid(sid: number): void {
  const memonic = memonics.find((m) => m.sid === sid);
  if (memonic) {
    memonic.usageCount += 1;
    scheduleSave();
  }
}

export function getMemonicsByFolder(folderPath: string): Memonic[] {
  return memonics.filter((m) => m.folderPath === folderPath);
}

export function getMemonicsByType(type: MemonicType): Memonic[] {
  return memonics.filter((m) => m.type === type);
}

export function getMemonicsByTag(tag: string): Memonic[] {
  return memonics.filter((m) =>
    m.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
  );
}

export function searchMemonics(query: string): Memonic[] {
  const q = query.toLowerCase();
  return memonics.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.context.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function getFoldersList(): string[] {
  const folders = new Set(memonics.map((m) => m.folderPath));
  return Array.from(folders).sort();
}

export function getMemonicTypesList(): string[] {
  const types = new Set(memonics.map((m) => m.type));
  return Array.from(types).sort();
}

export function addMemonic(memonic: Memonic): void {
  if (!memonic.sid) memonic.sid = generateSid();
  if (!Array.isArray(memonic.tags)) memonic.tags = [];
  if (!memonic.aiConfig) memonic.aiConfig = { providerId: "openrouter", model: "" };
  memonics.push(memonic);
  scheduleSave();
}

export function updateMemonic(id: string, updates: Partial<Memonic>): void {
  const index = memonics.findIndex((m) => m.id === id);
  if (index !== -1) {
    memonics[index] = { ...memonics[index], ...updates, updatedAt: Date.now() };
    scheduleSave();
  }
}

export function deleteMemonic(id: string): void {
  memonics = memonics.filter((m) => m.id !== id);
  scheduleSave();
}

export function isIdUsed(id: string): boolean {
  return memonics.some((m) => m.id === id);
}

export function createMemonic(params: {
  title: string;
  type: MemonicType;
  context: string;
  strength: MemonicStrength;
  tags: string[];
  folderPath: string;
  triggerKeywords: string[];
}): Memonic {
  const num = findSmallestFreeNumericId();
  const id = `mem-${num}`;

  return {
    id,
    title: params.title,
    type: params.type,
    context: params.context,
    strength: params.strength,
    source: { type: "user" },
    status: "active",
    sid: generateSid(),
    bid: 0,
    tags: params.tags,
    folderPath: params.folderPath,
    aiConfig: {
      providerId: "openrouter",
      model: "openai/gpt-4o-mini",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    suggestionBehavior: {
      triggerMode: "hybrid",
      triggerKeywords: params.triggerKeywords,
      promptTemplates: [
        {
          id: "default",
          label: "Explain",
          template: `Using this context: {{context}}\n\nRespond to: {{noteContent}}`,
        },
      ],
      priority: 3,
    },
  };
}
