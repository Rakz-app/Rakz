<script setup lang="ts">
// The vault EXPLORER — mirrors the on-disk tree exactly. A card's effective
// file is (hierarchy || subject id): folders 📁 nest by '/' segments, the last
// segment is the .mns FILE row, cards sit inside it. When a file holds a
// single subject named like the file (the common case) the redundant subject
// row is skipped. Searching force-expands and hides empty branches.

// ========== 1. IMPORTS ==========
import { computed, ref } from "vue";
import { useLibrary } from "@/composables/library";
import type { Memonic } from "@engine/types";
import type { CardLocation } from "@/composables/library/persistence";

// ========== 2. TYPES ==========
/** Forest node: a folder level holding cards and nested folder levels. */
interface TreeNode {
  path: string;
  cards: Memonic[];
  children: Map<string, TreeNode>;
}

/** Context-menu state (two-step delete armed by the second click). */
interface CardMenu {
  x: number;
  y: number;
  sid: number;
  title: string;
  loc: CardLocation | null;
  confirmDel: boolean;
}

/** Discriminated union of the flattened explorer rows. */
type ExplorerRow =
  | { type: "folder"; key: string; name: string; depth: number; count: number }
  | { type: "file"; key: string; name: string; node: TreeNode; depth: number; count: number; color: string }
  | { type: "subject"; key: string; id: string; depth: number; count: number; color: string }
  | { type: "card"; key: string; m: Memonic; depth: number };

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const props = defineProps({ query: { type: String, default: "" } });

const { memonics, subjects, activeSid, select, create, remove, locateCard, openVaultFolder, isDesktop, selectedSids, toggleSelected, openCardFile } = useLibrary();

const collapsed = ref<Record<string, boolean>>({});

const menu = ref<CardMenu | null>(null);

// ========== 5. LOGIC ==========

// ----- onRowClick -----
// purpose:   plain click opens a card; Ctrl/Cmd+click toggles bulk selection
// io:        in → e (MouseEvent), m (Memonic) | out → none
// processes: toggleSelected, select                                       [auto]
function onRowClick(e: MouseEvent, m: Memonic): void {
  if (e.ctrlKey || e.metaKey) toggleSelected(m.sid);
  else select(m.sid);
}

// ----- toggle -----
// purpose:   fold/unfold one tree row
// io:        in → key (string) | out → none
// processes: none                                                        [auto]
function toggle(key: string): void {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
}

// ----- openMenu -----
// purpose:   open the right-click menu on a card row (clamped to the viewport)
// io:        in → e (MouseEvent), m (Memonic) | out → none
// processes: locateCard                                                   [auto]
function openMenu(e: MouseEvent, m: Memonic): void {
  menu.value = {
    x: Math.min(e.clientX, window.innerWidth - 250),
    y: Math.min(e.clientY, window.innerHeight - 170),
    sid: m.sid, title: m.title, loc: locateCard(m.sid), confirmDel: false,
  };
}

// ----- closeMenu -----
// purpose:   dismiss the context menu
// io:        in → none | out → none
// processes: none                                                        [auto]
function closeMenu(): void {
  menu.value = null;
}

// ----- menuOpenCard -----
// purpose:   "Open card" menu action
// io:        in → none | out → none
// processes: select, closeMenu                                            [auto]
function menuOpenCard(): void {
  select(menu.value!.sid);
  closeMenu();
}

// ----- menuToggleSelect -----
// purpose:   "Select (bulk)" menu action
// io:        in → none | out → none
// processes: toggleSelected, closeMenu                                    [auto]
function menuToggleSelect(): void {
  toggleSelected(menu.value!.sid);
  closeMenu();
}

// ----- menuOpenFile -----
// purpose:   "Open file in editor" menu action (copies file:line first)
// io:        in → none | out → none
// processes: openCardFile, closeMenu                                      [auto]
async function menuOpenFile(): Promise<void> {
  const sid = menu.value!.sid;
  closeMenu();
  await openCardFile(sid);
}

// ----- menuReveal -----
// purpose:   "Reveal vault folder" menu action
// io:        in → none | out → none
// processes: openVaultFolder, closeMenu                                   [auto]
function menuReveal(): void {
  openVaultFolder();
  closeMenu();
}

// ----- menuDelete -----
// purpose:   two-step delete — first click arms, second click removes
// io:        in → none | out → none
// processes: remove, closeMenu                                            [auto]
function menuDelete(): void {
  if (!menu.value!.confirmDel) {
    menu.value = { ...menu.value!, confirmDel: true };
    return;
  }
  remove(menu.value!.sid);
  closeMenu();
}

const q = computed(() => props.query.trim().toLowerCase());

// ----- matches -----
// purpose:   does a card match the search query (title, context, or tags)?
// io:        in → m (Memonic) | out → boolean (true when query is empty)
// processes: none                                                        [auto]
function matches(m: Memonic): boolean {
  return !q.value || `${m.title} ${m.context} ${m.tags.join(" ")}`.toLowerCase().includes(q.value);
}

// ----- colorOf -----
// purpose:   the subject color for a subject id
// io:        in → id (string) | out → string (hex)
// processes: none                                                        [auto]
function colorOf(id: string): string {
  return subjects.value.find((s) => s.id === id)?.color ?? "#555";
}

// ----- effPath -----
// purpose:   the card's effective path (hierarchy wins, subject id is the fallback)
// io:        in → m (Memonic) | out → string
// processes: none                                                        [auto]
function effPath(m: Memonic): string {
  return m.hierarchy || m.id || "vault";
}

// ----- rows -----
// purpose:   flatten the vault forest into explorer rows (folder / file / subject / card) with depths
// io:        in → none | out → explorer rows for the template
// processes: matches, colorOf, subtreeMatch, subtreeCount                 [auto]
const rows = computed(() => {
  // 1. Build the forest. Node = { path, cards: [], children: Map }
  const root = new Map<string, TreeNode>();
  for (const m of memonics.value) {
    let level = root;
    let path = "";
    const segs = effPath(m).split("/");
    let node: TreeNode | undefined;
    for (const seg of segs) {
      path = path ? path + "/" + seg : seg;
      if (!level.has(seg)) level.set(seg, { path, cards: [], children: new Map() });
      node = level.get(seg)!;
      level = node.children;
    }
    node!.cards.push(m);
  }

  // 2. Search helpers: does anything in this subtree match / how many cards total
  const subtreeMatch = (node: TreeNode): boolean =>
    node.cards.some(matches) || [...node.children.values()].some(subtreeMatch);
  const subtreeCount = (node: TreeNode): number =>
    node.cards.length + [...node.children.values()].reduce((n, c) => n + subtreeCount(c), 0);

  // 3. Flatten depth-first, respecting collapse (ignored while searching)
  const out: ExplorerRow[] = [];
  const pushFileContents = (node: TreeNode, depth: number) => {
    const cards = node.cards.filter(matches);
    const ids = [...new Set(node.cards.map((m) => m.id))];
    const seg = node.path.split("/").pop()!;
    // 3a. single-subject file named like the subject — skip the redundant row
    if (ids.length === 1 && ids[0] === seg) {
      for (const m of cards) out.push({ type: "card", key: "c" + m.sid, m, depth });
      return;
    }
    // 3b. mixed file — one subject row per subject, cards nested under it
    for (const id of ids) {
      const subjectCards = cards.filter((m) => m.id === id);
      if (q.value && !subjectCards.length) continue;
      const key = "S:" + node.path + "|" + id;
      out.push({ type: "subject", key, id, color: colorOf(id), depth, count: node.cards.filter((m) => m.id === id).length });
      if (!q.value && collapsed.value[key]) continue;
      for (const m of subjectCards) out.push({ type: "card", key: "c" + m.sid, m, depth: depth + 1 });
    }
  };
  const walk = (level: Map<string, TreeNode>, depth: number) => {
    for (const seg of [...level.keys()].sort((a, b) => a.localeCompare(b))) {
      const node = level.get(seg)!;
      if (q.value && !subtreeMatch(node)) continue;
      const isFolder = node.children.size > 0;
      if (isFolder) {
        const key = "f:" + node.path;
        out.push({ type: "folder", key, name: seg, depth, count: subtreeCount(node) });
        if (!q.value && collapsed.value[key]) continue;
        // a path can be a file AND a folder ('a.mns' next to 'a/'):
        if (node.cards.length) {
          const fkey = "d:" + node.path;
          out.push({ type: "file", key: fkey, name: seg, node, depth: depth + 1, count: node.cards.length, color: colorOf(node.cards[0]!.id) });
          if (q.value || !collapsed.value[fkey]) pushFileContents(node, depth + 2);
        }
        walk(node.children, depth + 1);
      } else {
        const key = "d:" + node.path;
        out.push({ type: "file", key, name: seg, node, depth, count: node.cards.length, color: colorOf(node.cards[0]?.id ?? "") });
        if (q.value || !collapsed.value[key]) pushFileContents(node, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
});

// ----- addToFile -----
// purpose:   "+" on a file row — create a new card in that file's subject and folder
// io:        in → node (TreeNode) | out → none
// processes: create                                                        [auto]
function addToFile(node: TreeNode): void {
  const first = node.cards[0];
  if (first) create(first.id, first.hierarchy || "");
}
</script>

<template>
  <div class="flex flex-col gap-px px-1.5 py-1">
    <template v-for="row in rows" :key="row.key">
      <!-- 📁 folder -->
      <div
        v-if="row.type === 'folder'"
        class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2"
        :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
        @click="toggle(row.key)"
      >
        <span class="text-[11px] text-gray-600 transition-transform" :style="{ transform: collapsed[row.key] ? 'rotate(-90deg)' : 'none' }">▾</span>
        <span class="text-[12px]">📁</span>
        <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#C8C8C8]" :style="{ fontSize: '13px', fontWeight: 700 }">{{ row.name }}</span>
        <span class="text-gray-600" :style="{ fontSize: '12px' }">{{ row.count }}</span>
      </div>

      <!-- 📄 .mns file -->
      <div
        v-else-if="row.type === 'file'"
        class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2"
        :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
        @click="toggle(row.key)"
      >
        <span class="text-[11px] text-gray-600 transition-transform" :style="{ transform: collapsed[row.key] ? 'rotate(-90deg)' : 'none' }">▾</span>
        <span class="h-[9px] w-[9px] flex-shrink-0 rounded-[3px]" :style="{ backgroundColor: row.color }" />
        <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#e8e8e8]" :style="{ fontSize: '14px', fontWeight: 700 }">{{ row.name }}</span>
        <span class="text-gray-600" :style="{ fontSize: '12px' }">{{ row.count }}</span>
        <button
          title="New memonic in this file"
          class="border-0 bg-transparent px-0.5 text-[15px] leading-none text-gray-600"
          style="cursor: pointer"
          @click.stop="addToFile(row.node)"
        >+</button>
      </div>

      <!-- subject group (only when a file mixes subjects) -->
      <div
        v-else-if="row.type === 'subject'"
        class="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2"
        :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
        @click="toggle(row.key)"
      >
        <span class="text-[10px] text-gray-600 transition-transform" :style="{ transform: collapsed[row.key] ? 'rotate(-90deg)' : 'none' }">▾</span>
        <span class="h-[8px] w-[8px] flex-shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
        <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#B8B8C0]" :style="{ fontSize: '13px', fontWeight: 600 }">{{ row.id }}</span>
        <span class="text-gray-600" :style="{ fontSize: '11px' }">{{ row.count }}</span>
      </div>

      <!-- card -->
      <div
        v-else
        class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2"
        :style="{
          paddingLeft: `${14 + row.depth * 16}px`,
          backgroundColor: selectedSids.includes(row.m.sid) ? 'rgba(8,145,178,0.14)' : (row.m.sid === activeSid ? '#1B1B1F' : 'transparent'),
          borderLeft: row.m.sid === activeSid ? '2px solid var(--accent)' : '2px solid transparent',
        }"
        @click="onRowClick($event, row.m)"
        @contextmenu.prevent="openMenu($event, row.m)"
      >
        <span v-if="selectedSids.includes(row.m.sid)" :style="{ fontSize: '11px', color: '#22d3ee', flexShrink: 0 }">☑</span>
        <span class="overflow-hidden text-ellipsis whitespace-nowrap" :style="{ fontSize: '13px', color: row.m.sid === activeSid ? '#f0f0f0' : '#9A9AA2' }">{{ row.m.title }}</span>
      </div>
    </template>

    <!-- context menu -->
    <Teleport to="body">
      <template v-if="menu">
        <div :style="{ position: 'fixed', inset: 0, zIndex: 2000 }" @click="closeMenu" @contextmenu.prevent="closeMenu"></div>
        <div :style="{ position: 'fixed', left: menu.x + 'px', top: menu.y + 'px', zIndex: 2001, minWidth: '230px', backgroundColor: 'rgba(18,18,22,0.97)', border: '1px solid #2C2C2C', borderRadius: '10px', boxShadow: '0 16px 40px rgba(0,0,0,0.6)', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'system-ui, sans-serif' }">
          <div :style="{ padding: '6px 10px', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }">{{ menu.title }}</div>
          <button @click="menuOpenCard" :style="{ textAlign: 'left', fontSize: '12px', color: '#e8e8e8', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer' }">▸ Open card</button>
          <button @click="menuToggleSelect" :style="{ textAlign: 'left', fontSize: '12px', color: '#C8C8C8', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer' }">☑ {{ selectedSids.includes(menu.sid) ? 'Deselect' : 'Select (bulk)' }}</button>
          <div v-if="menu.loc" :style="{ padding: '5px 10px', fontSize: '11px', color: '#8a8a90', fontFamily: 'JetBrains Mono, monospace' }">📄 {{ menu.loc.file }} : line {{ menu.loc.line }}</div>
          <button v-if="isDesktop && menu.loc" @click="menuOpenFile" :style="{ textAlign: 'left', fontSize: '12px', color: '#C8C8C8', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer' }">📝 Open file in editor <span :style="{ color: '#555' }">(copies :line {{ menu.loc.line }})</span></button>
          <button v-if="isDesktop" @click="menuReveal" :style="{ textAlign: 'left', fontSize: '12px', color: '#C8C8C8', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer' }">🗂 Reveal vault folder</button>
          <button @click.stop="menuDelete" :style="{ textAlign: 'left', fontSize: '12px', fontWeight: 700, color: menu.confirmDel ? '#fecaca' : '#c98a8a', backgroundColor: menu.confirmDel ? '#7f1d1d' : 'transparent', border: 'none', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer' }">{{ menu.confirmDel ? 'Confirm delete?' : '🗑 Delete' }}</button>
        </div>
      </template>
    </Teleport>
  </div>
</template>
