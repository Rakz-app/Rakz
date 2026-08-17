<script setup lang="ts">
// Floating bulk-action bar — appears whenever the Ctrl+click selection is
// non-empty. Move (re-hir), Copy as .mns text, Export to .exports/, Delete.

// ========== 1. IMPORTS ==========
import { ref } from "vue";
import { useLibrary } from "@/composables/library";
import { useAgent } from "@/composables/useAgent";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const { selectedSids, clearSelected, bulkMove, bulkDelete, copySelection, exportSelection } = useLibrary();

const moveTo = ref("");
const confirmDel = ref(false);
const copied = ref(false);

const { openAsk } = useAgent();

// ========== 5. LOGIC ==========

// ----- doMove -----
// purpose:   move the selection to the typed folder (empty = regroup by subject)
// io:        in → none | out → none
// processes: bulkMove                                                       [auto]
function doMove(): void {
  bulkMove(moveTo.value);
  moveTo.value = "";
}

// ----- doCopy -----
// purpose:   copy the selection as .mns text and flash a confirmation
// io:        in → none | out → none
// processes: copySelection                                                  [auto]
async function doCopy(): Promise<void> {
  copied.value = await copySelection();
  setTimeout(() => (copied.value = false), 1500);
}

// ----- doDelete -----
// purpose:   two-step delete — first click arms (3s window), second click deletes
// io:        in → none | out → none
// processes: bulkDelete                                                     [auto]
function doDelete(): void {
  if (!confirmDel.value) {
    confirmDel.value = true;
    setTimeout(() => (confirmDel.value = false), 3000);
    return;
  }
  confirmDel.value = false;
  bulkDelete();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="selectedSids.length"
      :style="{
        position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', zIndex: 1500,
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', maxWidth: '92vw',
        backgroundColor: 'rgba(15,15,18,0.96)', border: '1px solid rgba(8,145,178,0.4)', borderRadius: '12px',
        padding: '10px 14px', boxShadow: '0 16px 40px rgba(0,0,0,0.6)', fontFamily: 'system-ui, sans-serif',
      }"
    >
      <span :style="{ fontSize: '12px', fontWeight: 700, color: '#22d3ee' }">☑ {{ selectedSids.length }} selected</span>
      <div :style="{ width: '1px', height: '16px', backgroundColor: '#2C2C2C' }"></div>

      <input
        v-model="moveTo"
        @keydown.enter="doMove"
        placeholder="📁 move to folder… (empty = by subject)"
        :style="{ width: '220px', backgroundColor: '#0F0F12', border: '1px solid #222', borderRadius: '6px', padding: '5px 10px', color: '#C8C8C8', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', outline: 'none' }"
      />
      <button @click="doMove" :style="{ fontSize: '11px', fontWeight: 700, color: '#C8C8C8', backgroundColor: 'transparent', border: '1px solid #2C2C2C', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }">Move</button>

      <button @click="doCopy" :style="{ fontSize: '11px', fontWeight: 700, color: copied ? '#8AE28A' : '#C8C8C8', backgroundColor: 'transparent', border: '1px solid #2C2C2C', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }">{{ copied ? 'Copied ✓' : 'Copy .mns' }}</button>
      <button @click="openAsk" :style="{ fontSize: '11px', fontWeight: 700, color: '#22d3ee', backgroundColor: 'transparent', border: '1px solid rgba(8,145,178,0.4)', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }">✦ Ask AI</button>
      <button @click="exportSelection" :style="{ fontSize: '11px', fontWeight: 700, color: '#C8C8C8', backgroundColor: 'transparent', border: '1px solid #2C2C2C', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }">Export .mns</button>
      <button @click="doDelete" :style="{ fontSize: '11px', fontWeight: 700, color: confirmDel ? '#fecaca' : '#c98a8a', backgroundColor: confirmDel ? '#7f1d1d' : 'transparent', border: confirmDel ? '1px solid #ef4444' : '1px solid #2C2C2C', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }">{{ confirmDel ? 'Confirm delete?' : '🗑 Delete' }}</button>
      <button @click="clearSelected" title="Clear selection" :style="{ fontSize: '12px', color: '#666', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }">✕</button>
    </div>
  </Teleport>
</template>
