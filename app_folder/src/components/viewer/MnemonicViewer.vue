<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { computed, ref, watch } from "vue";
import { useLibrary } from "@/composables/library";
import MnemonicCard from "@/components/viewer/MnemonicCard.vue";
import GraphView from "@/components/graph/GraphView.vue";
import Dialog from "@/components/ui/Dialog.vue";
import StarRating from "@/components/ui/StarRating.vue";
import type { Memonic } from "@engine/types";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const props = defineProps({
  view: { type: String, default: "stack" },
  sort: { type: String, default: "recent" },
  filterTag: { type: String, default: "" },
});

const { deck, subjects, memonics, activeSid, select } = useLibrary();

const modalId = ref<number | null>(null);
const modalMemonic = computed<Memonic | undefined>(() => memonics.value.find((m) => m.sid === modalId.value));

// ========== 5. LOGIC ==========

// ----- processList -----
// purpose:   apply the TopBar filter and sort to a card list
// io:        in → list (Memonic[]) | out → Memonic[] (filtered + sorted copy)
// processes: none                                                        [auto]
function processList(list: Memonic[]): Memonic[] {
  // 1. hashtag filter (case-insensitive, '#' optional)
  let arr = [...list];
  if (props.filterTag) {
    const f = props.filterTag.toLowerCase().replace("#", "");
    arr = arr.filter((m) => m.tags && m.tags.some((t) => t.toLowerCase().includes(f)));
  }
  // 2. sort by the chosen key
  if (props.sort === "recent") arr.sort((a, b) => b.sid - a.sid);
  else if (props.sort === "importance") arr.sort((a, b) => (b.importance || 0) - (a.importance || 0));
  else if (props.sort === "linked") arr.sort((a, b) => (b.links?.length || 0) - (a.links?.length || 0));
  return arr;
}

// ----- arrangedStack -----
// purpose:   the stack view cards with their position relative to the active card
// io:        in → none | out → { memonic, relative }[]
// processes: processList                                                  [auto]
const arrangedStack = computed(() => {
  const arr = processList(deck.value);
  const activeIdx = arr.findIndex((m) => m.sid === activeSid.value);
  return arr.map((m, i) => {
    const relative = i - (activeIdx === -1 ? 0 : activeIdx);
    return { memonic: m, relative };
  });
});

// Keep selection consistent with what is visible: if filter/sort hides the
// active card, promote the first visible one — TopBar, card, and RightPanel
// then all describe the SAME card.
watch(arrangedStack, () => {
  if (props.view !== "stack") return;
  const arr = arrangedStack.value;
  if (arr.length && !arr.some(({ memonic }) => memonic.sid === activeSid.value)) {
    select(arr[0]!.memonic.sid);
  }
});

// ----- groupedGrid -----
// purpose:   the grid view — processed cards grouped by subject (empty groups dropped)
// io:        in → none | out → { subject, cards }[]
// processes: processList                                                  [auto]
const groupedGrid = computed(() => {
  const allProcessed = processList(memonics.value);
  return subjects.value
    .map((s) => ({ subject: s, cards: allProcessed.filter((m) => m.id === s.id) }))
    .filter((g) => g.cards.length > 0);
});

// If the card shown in the modal is deleted, close the modal with it.
watch(modalMemonic, (m) => {
  if (modalId.value != null && !m) modalId.value = null;
});

// The card's < > arrows navigate by changing the selection; while the modal
// is open it follows the selection so the arrows page through cards there too.
watch(activeSid, (sid) => {
  if (modalId.value != null && sid != null && sid !== modalId.value) modalId.value = sid;
});
</script>

<template>
  <div :style="{ flex: 1, position: 'relative', backgroundColor: '#09090B', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }">

    <!-- GRID VIEW -->
    <div v-if="view === 'grid'" :style="{ flex: 1, overflowY: 'auto', padding: '40px' }" class="custom-scrollbar">
      <div :style="{ maxWidth: '1200px', margin: '0 auto' }">
        <div v-for="group in groupedGrid" :key="group.subject.id" :style="{ marginBottom: '40px' }">

           <!-- Group Header -->
           <div :style="{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingLeft: '4px' }">
              <div :style="{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: group.subject.color }"></div>
              <h2 :style="{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#e8e8e8' }">{{ group.subject.name }}</h2>
              <span :style="{ fontSize: '11px', color: '#555', fontWeight: 600, marginLeft: '4px' }">{{ group.cards.length }}</span>
           </div>

           <!-- Cards Grid -->
           <div :style="{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }">
              <div
                v-for="card in group.cards" :key="card.sid"
                @click="modalId = card.sid; select(card.sid)"
                class="grid-card-hover"
                :style="{ cursor: 'pointer', height: '190px', transition: 'transform 0.2s ease-out' }"
              >
                 <!-- Figma-Accurate Grid Card -->
                 <div :style="{ width: '100%', height: '100%', backgroundColor: '#121214', borderTop: `3px solid ${group.subject.color}`, borderRight: '1px solid #1E1E22', borderBottom: '1px solid #1E1E22', borderLeft: '1px solid #1E1E22', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }">

                    <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }">
                       <span :style="{ fontSize: '9px', fontWeight: 800, color: group.subject.color, textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: `${group.subject.color}15`, padding: '3px 6px', borderRadius: '4px' }">{{ group.subject.name }}</span>
                       <span :style="{ fontSize: '9px', color: '#555', textTransform: 'uppercase', fontWeight: 700 }">{{ card.type }}</span>
                    </div>

                    <h3 :style="{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 700, color: '#fff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }">{{ card.title }}</h3>

                    <p :style="{ margin: 0, fontSize: '12px', color: '#9A9AA2', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }">{{ card.context }}</p>

                    <div :style="{ marginTop: 'auto', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1E1E22' }">
                       <StarRating :model-value="card.importance" :readonly="true" />
                       <span :style="{ fontSize: '10px', color: '#555', fontWeight: 500 }">Active</span>
                    </div>

                 </div>
              </div>
           </div>
        </div>
      </div>

      <!-- Grid Modal -->
      <Dialog :open="!!modalId" width="700px" @close="modalId = null">
         <div :style="{ height: '600px', backgroundColor: '#161618', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }">
            <MnemonicCard v-if="modalMemonic" :memonic="modalMemonic" :editable="true" />
         </div>
      </Dialog>
    </div>

    <!-- GRAPH VIEW -->
    <GraphView v-else-if="view === 'graph'" />

    <!-- STACK VIEW -->
    <div v-else :style="{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }">
      <div :style="{ position: 'relative', width: '100%', maxWidth: '750px', height: '100%', maxHeight: '650px', display: 'flex', alignItems: 'center', justifyContent: 'center' }">
        <div
          v-for="({ memonic, relative }) in arrangedStack"
          :key="memonic.sid"
          @click="select(memonic.sid)"
          :style="{
            position: 'absolute', width: '100%', height: '100%', transition: 'all 0.5s ease-out', transformOrigin: 'left center',
            zIndex: 100 - Math.abs(relative),
            cursor: relative === 0 ? 'default' : 'pointer',
            transform: relative === 0 ? 'none' : `translate(${relative * -40}px, 0) scale(${1 - Math.abs(relative) * 0.05})`,
            opacity: relative > 0 ? 0 : (Math.abs(relative) > 5 ? 0 : 1 - (Math.abs(relative) * 0.1)),
            pointerEvents: relative > 0 ? 'none' : 'auto'
          }"
        >
          <MnemonicCard
            :memonic="memonic"
            :editable="relative === 0"
            :style="{ width: '100%', height: '100%', boxShadow: relative === 0 ? '0 20px 50px rgba(0,0,0,0.5)' : '30px 0 60px -15px rgba(0,0,0,0.9)', filter: relative === 0 ? 'none' : 'brightness(0.4)', border: relative === 0 ? '1px solid rgba(8,145,178,0.5)' : 'none', transition: 'all 0.5s ease-out' }"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="arrangedStack.length === 0" :style="{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555', gap: '16px' }">
        <div :style="{ fontSize: '48px', opacity: 0.2 }">🗂️</div>
        <p :style="{ fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }">No cards match this filter.</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #2C2C30; border-radius: 10px; }
.custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: #444; }
.grid-card-hover:hover { transform: translateY(-4px) !important; }
</style>
