<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { computed, ref } from "vue";
import StarRating from "@/components/ui/StarRating.vue";
import TagTokens from "@/components/ui/TagTokens.vue";
import { useLibrary } from "@/composables/library";
import type { Memonic } from "@engine/types";
import type { Link } from "@engine/types";

// ========== 2. TYPES ==========
/** A picked link target in the new-link form. */
interface LinkTarget {
  sid: number;
  title: string;
}

// ========== 3. CONSTANTS ==========
const TYPES = ["Rule", "Fact", "Story"];

// ========== 4. STATE ==========
const props = defineProps({
  memonic: { type: Object as () => Memonic, required: true },
  editable: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
});

// Pull in both the edit function AND the raw reactive state
const { editField, memonics, deck, select, remove, link, renameLink } = useLibrary();

// Two-step delete: first click arms it (3s window), second click deletes.
// (Native confirm() dialogs are inert inside the Tauri webview.)
const confirmingDelete = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

// Link hints + authoring — pure UI over the EXISTING Link shape {title, targetSID}.
const linksOpen = ref(true);

// New-link form: search targets by title, pick one, name the edge yourself.
const newLinkOpen = ref(false);
const linkQuery = ref("");
const linkTarget = ref<LinkTarget | null>(null);
const linkTitle = ref("");

// Rename an edge in place: click its title chip, type the story, Enter.
const editingLink = ref<number | null>(null);
const editTitle = ref("");

// ========== 5. LOGIC ==========

// ----- liveCard -----
// purpose:   deeply reactive re-resolution of this specific card from the mirror (props are stale snapshots)
// io:        in → none | out → Memonic (falls back to the prop while unknown)
// processes: none                                                        [auto]
const liveCard = computed<Memonic>(() => {
  return memonics.value.find((m) => m.sid === props.memonic.sid) || props.memonic;
});

// ----- askDelete -----
// purpose:   two-step delete — first click arms (3s window), second click removes
// io:        in → none | out → none
// processes: remove                                                        [auto]
function askDelete(): void {
  if (!props.editable) return;
  if (!confirmingDelete.value) {
    confirmingDelete.value = true;
    clearTimeout(confirmTimer ?? undefined);
    confirmTimer = setTimeout(() => (confirmingDelete.value = false), 3000);
    return;
  }
  clearTimeout(confirmTimer ?? undefined);
  confirmingDelete.value = false;
  remove(liveCard.value.sid);
}

// ----- set -----
// purpose:   fire one scalar-field edit at the engine (the liveCard computed catches the echo)
// io:        in → field (string), value (unknown) | out → none
// processes: editField                                                     [auto]
function set(field: string, value: unknown): void {
  if (props.editable) {
    editField(props.memonic.sid, field, value);
  }
}

// ----- nav -----
// purpose:   step to the previous/next card within this card's subject deck (wraps around)
// io:        in → dir (number, -1 | 1) | out → none
// processes: select                                                        [auto]
function nav(dir: number): void {
  const list = deck.value;
  if (list.length < 2) return;
  const i = list.findIndex((m) => m.sid === liveCard.value.sid);
  const next = list[(i + dir + list.length) % list.length]!;
  select(next.sid);
}

// ----- deckPos -----
// purpose:   position indicator for the arrows: "2/5" within the subject deck
// io:        in → none | out → { i, n }
// processes: none                                                        [auto]
const deckPos = computed(() => {
  const list = deck.value;
  const i = list.findIndex((m) => m.sid === liveCard.value.sid);
  return { i: i >= 0 ? i + 1 : 1, n: Math.max(list.length, 1) };
});

// ----- targetTitle -----
// purpose:   resolve a link target's title for display
// io:        in → sid (number) | out → string ('(missing card)' when gone)
// processes: none                                                        [auto]
function targetTitle(sid: number): string {
  return memonics.value.find((m) => m.sid === sid)?.title ?? "(missing card)";
}

// ----- linkResults -----
// purpose:   up to six unlinked cards whose title matches the new-link search
// io:        in → none | out → Memonic[]
// processes: none                                                        [auto]
const linkResults = computed<Memonic[]>(() => {
  const q = linkQuery.value.trim().toLowerCase();
  if (!q || linkTarget.value) return [];
  const linked = new Set((liveCard.value.links ?? []).map((l) => l.targetSID));
  return memonics.value
    .filter((m) => m.sid !== liveCard.value.sid && !linked.has(m.sid) && m.title.toLowerCase().includes(q))
    .slice(0, 6);
});

// ----- createLink -----
// purpose:   create the named edge to the picked target and close the form
// io:        in → none | out → none (no-op without a picked target)
// processes: link                                                          [auto]
function createLink(): void {
  if (!linkTarget.value) return;
  link(liveCard.value.sid, linkTarget.value.sid, linkTitle.value.trim() || "related");
  newLinkOpen.value = false;
  linkQuery.value = "";
  linkTarget.value = null;
  linkTitle.value = "";
}

// ----- startRename -----
// purpose:   open the inline rename input for one edge
// io:        in → l (Link) | out → none
// processes: none                                                          [auto]
function startRename(l: Link): void {
  if (!props.editable) return;
  editingLink.value = l.targetSID;
  editTitle.value = l.title;
}

// ----- commitRename -----
// purpose:   commit the renamed edge (remove + re-add) when the title actually changed
// io:        in → l (Link) | out → none
// processes: renameLink                                                    [auto]
function commitRename(l: Link): void {
  const t = editTitle.value.trim();
  if (t && t !== l.title) renameLink(liveCard.value.sid, l.targetSID, t);
  editingLink.value = null;
}
</script>

<template>
  <div :style="{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#161618', borderRadius: '12px', border: '1px solid #2C2C30', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }">

    <!-- TOP NAV BAR -->
    <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #222' }">
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
        <!-- .stop is load-bearing: the stack wrapper's own @click re-selects
             this card, which would instantly undo the navigation. -->
        <button title="Previous card" @click.stop="nav(-1)" :style="{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: '#1A1A1E', color: '#666', border: 'none', cursor: 'pointer' }">&lt;</button>
        <button title="Next card" @click.stop="nav(1)" :style="{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: '#1A1A1E', color: '#666', border: 'none', cursor: 'pointer' }">&gt;</button>
        <span :style="{ fontSize: '11px', fontWeight: 700, color: '#8a8a90', fontFamily: 'JetBrains Mono, monospace', marginLeft: '4px' }">{{ deckPos.i }}/{{ deckPos.n }}</span>
        <span :style="{ fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '0.15em', marginLeft: '8px', textTransform: 'uppercase' }">Card</span>
      </div>

      <!-- TYPE TOGGLES -->
      <div :style="{ display: 'flex', gap: '4px', backgroundColor: '#0F0F12', padding: '4px', borderRadius: '8px', border: '1px solid #222' }">
        <button
          v-for="t in TYPES" :key="t"
          @click.prevent="set('type', t)"
          :style="{
             padding: '4px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: '6px', border: 'none',
             cursor: editable ? 'pointer' : 'default',
             backgroundColor: liveCard.type === t ? 'rgba(8,145,178,0.2)' : 'transparent',
             color: liveCard.type === t ? '#22d3ee' : '#666'
          }"
        >{{ t }}</button>
      </div>

      <div :style="{ width: '96px' }"></div>
    </div>

    <!-- BODY CONTENT -->
    <div :style="{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }">
      <!-- Title -->
      <input
        v-if="editable" :value="liveCard.title" @input="set('title', ($event.target as HTMLInputElement).value)"
        placeholder="Card Title..."
        :style="{ backgroundColor: 'transparent', fontSize: compact ? '24px' : '30px', fontWeight: 700, color: '#fff', border: 'none', outline: 'none', width: '100%' }"
      />
      <h1 v-else :style="{ fontSize: compact ? '24px' : '30px', fontWeight: 700, color: '#fff', margin: 0 }">{{ liveCard.title }}</h1>

      <!-- Context / Explanation -->
      <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }">
         <span :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.2em', textTransform: 'uppercase' }">Context &amp; Explanation</span>
         <textarea
           v-if="editable" :value="liveCard.context" @input="set('context', ($event.target as HTMLTextAreaElement).value)"
           placeholder="Write your explanation here..."
           :style="{ width: '100%', height: '100%', minHeight: '120px', backgroundColor: '#0F0F12', border: '1px solid #222', borderRadius: '8px', padding: '20px', color: '#D1D1D6', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }"
         ></textarea>
         <p v-else :style="{ color: '#D1D1D6', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }">{{ liveCard.context }}</p>
      </div>

      <!-- Tags & Links -->
      <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto', paddingTop: '16px' }">
         <span :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.2em', textTransform: 'uppercase' }">Tags &amp; Links</span>
         <TagTokens v-if="editable" :model-value="liveCard.tags || []" :active-subject-id="liveCard.id" @update:model-value="set('tags', $event)" />
         <div v-else :style="{ display: 'flex', flexWrap: 'wrap', gap: '8px' }">
           <span v-for="t in liveCard.tags" :key="t" :style="{ fontSize: '12px', fontFamily: 'monospace', color: '#22d3ee', backgroundColor: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.3)', borderRadius: '20px', padding: '4px 12px' }">#{{ t }}</span>
         </div>

         <!-- Link hints: key = edge title, value = target card. The value is a
              masked read-only chip — clicking it opens the target; editing and
              unlinking stay in the right panel so nothing gets messed up here. -->
         <div v-if="editable || (liveCard.links && liveCard.links.length)" :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }">
            <div :style="{ display: 'flex', alignItems: 'center', gap: '10px' }">
               <span :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }" @click.stop="linksOpen = !linksOpen">🔗 Linked ({{ liveCard.links?.length || 0 }})</span>
               <span :style="{ fontSize: '10px', color: '#22d3ee', fontWeight: 700, cursor: 'pointer' }" @click.stop="linksOpen = !linksOpen">{{ linksOpen ? 'hide' : 'show' }}</span>
               <button v-if="editable" @click.stop="newLinkOpen = !newLinkOpen" :style="{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: '#22d3ee', backgroundColor: 'transparent', border: '1px solid rgba(8,145,178,0.4)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }">+ New Link</button>
            </div>

            <!-- title|sid rows — the edge title is the STORY; click it to rewrite it -->
            <div v-if="linksOpen && liveCard.links?.length" :style="{ display: 'flex', flexDirection: 'column', gap: '6px' }">
               <div v-for="l in liveCard.links" :key="String(l.targetSID) + '·' + l.title" :style="{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }">
                  <input
                    v-if="editingLink === l.targetSID"
                    v-model="editTitle"
                    @keydown.enter="commitRename(l)"
                    @blur="commitRename(l)"
                    @click.stop
                    :style="{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: '#22d3ee', backgroundColor: '#0F0F12', border: '1px solid rgba(8,145,178,0.6)', borderRadius: '20px', padding: '3px 10px', outline: 'none', width: '180px' }"
                  />
                  <span
                    v-else
                    :title="editable ? 'Rename this link (why are they linked?)' : ''"
                    @click.stop="startRename(l)"
                    :style="{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: '#22d3ee', backgroundColor: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.3)', borderRadius: '20px', padding: '3px 10px', flexShrink: 0, cursor: editable ? 'text' : 'default' }"
                  >#{{ l.title }}</span>
                  <span :style="{ color: '#555', fontSize: '12px', flexShrink: 0 }">→</span>
                  <button
                    :title="'Open: ' + targetTitle(l.targetSID)"
                    @click.stop="select(l.targetSID)"
                    :style="{ fontSize: '12px', color: '#C8C8C8', backgroundColor: '#1A1A1E', border: '1px solid #2C2C30', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }"
                  >{{ targetTitle(l.targetSID) }} <span :style="{ color: '#555', fontFamily: 'JetBrains Mono, monospace' }">|{{ l.targetSID }}</span></button>
               </div>
            </div>

            <!-- new-link form: search title → pick → name the edge -->
            <div v-if="newLinkOpen && editable" @click.stop :style="{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#0F0F12', border: '1px solid #222', borderRadius: '8px', padding: '10px' }">
               <input
                 v-model="linkQuery"
                 @input="linkTarget = null"
                 placeholder="Search a card by title…"
                 :style="{ backgroundColor: 'transparent', border: '1px solid #222', borderRadius: '6px', padding: '6px 10px', color: '#e8e8e8', fontSize: '12px', outline: 'none' }"
               />
               <div v-if="linkResults.length" :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
                  <button
                    v-for="m in linkResults" :key="m.sid"
                    @click.stop="linkTarget = { sid: m.sid, title: m.title }; linkQuery = m.title"
                    :style="{ textAlign: 'left', fontSize: '12px', color: '#C8C8C8', backgroundColor: 'transparent', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }"
                  >{{ m.title }} <span :style="{ color: '#555', fontFamily: 'JetBrains Mono, monospace' }">· {{ m.id }} |{{ m.sid }}</span></button>
               </div>
               <div v-if="linkTarget" :style="{ fontSize: '11px', color: '#8AE28A' }">→ {{ linkTarget.title }} <span :style="{ fontFamily: 'JetBrains Mono, monospace', color: '#555' }">|{{ linkTarget.sid }}</span></div>
               <input
                 v-model="linkTitle"
                 @keydown.enter="createLink"
                 placeholder="Why linked? — the link's title (e.g. same-joke, contrast, story…)"
                 :style="{ backgroundColor: 'transparent', border: '1px solid #222', borderRadius: '6px', padding: '6px 10px', color: '#22d3ee', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', outline: 'none' }"
               />
               <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
                  <button @click.stop="newLinkOpen = false" :style="{ fontSize: '11px', color: '#9A9AA2', backgroundColor: 'transparent', border: '1px solid #2C2C2C', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer' }">Cancel</button>
                  <button @click.stop="createLink" :style="{ fontSize: '11px', fontWeight: 700, color: linkTarget ? '#000' : '#555', backgroundColor: linkTarget ? '#0891b2' : '#1E1E22', border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: linkTarget ? 'pointer' : 'default' }">Create Link</button>
               </div>
            </div>
         </div>

         <!-- @hir — which vault file/folder this card saves to. Folders are born on disk on the next save. -->
         <div v-if="editable" :style="{ display: 'flex', alignItems: 'center', gap: '10px' }">
            <span :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase', flexShrink: 0 }">📁 Location</span>
            <input
              :value="liveCard.hierarchy || ''"
              @change="set('hierarchy', ($event.target as HTMLInputElement).value.trim())"
              placeholder="folder/subfolder — empty saves to <subject>.mns"
              :style="{ flex: 1, backgroundColor: '#0F0F12', border: '1px solid #222', borderRadius: '6px', padding: '6px 10px', color: '#9A9AA2', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', outline: 'none' }"
            />
         </div>
      </div>
    </div>

    <!-- BOTTOM BAR — edits save automatically; delete is a two-step arm+confirm -->
    <div :style="{ padding: '14px 24px', backgroundColor: '#121214', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }">
      <div :style="{ display: 'flex', alignItems: 'center', gap: '14px' }">
        <button
          v-if="editable"
          @click.stop="askDelete"
          :style="{
            padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            backgroundColor: confirmingDelete ? '#7f1d1d' : 'transparent',
            border: confirmingDelete ? '1px solid #ef4444' : '1px solid #2C2C30',
            color: confirmingDelete ? '#fecaca' : '#8a8a90',
            transition: 'all 0.15s',
          }"
        >{{ confirmingDelete ? 'Confirm delete?' : '🗑 Delete' }}</button>
        <span :style="{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }">{{ editable ? 'Edits save automatically' : '' }}</span>
      </div>
      <StarRating :model-value="liveCard.importance" :readonly="!editable" @update:model-value="set('importance', $event)" />
    </div>
  </div>
</template>
