<script setup lang="ts">
// "Drop .rkz Premium Kit Here" — drag-drop a vault file. Parse/merge routes
// through useLibrary.importVaultText → engine importDocument.

// ========== 1. IMPORTS ==========
import { ref } from "vue";
import { mix } from "@/lib/utils";
import { useLibrary } from "@/composables/library";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const { importVaultText } = useLibrary();
const over = ref(false);
const note = ref("");

// ========== 5. LOGIC ==========

// ----- handleFile -----
// purpose:   read a dropped/picked vault file and import its text
// io:        in → file (File | null | undefined) | out → none (result lands in note)
// processes: importVaultText                                                 [auto]
function handleFile(file: File | null | undefined): void {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    note.value = importVaultText(String(reader.result))
      ? `Loaded “${file.name}” ✓`
      : "That file is not a valid RAKZ kit (.mns / .rkz).";
  };
  reader.readAsText(file);
}

// ----- onDrop -----
// purpose:   accept a drag-drop and hand the first file to the importer
// io:        in → e (DragEvent) | out → none
// processes: handleFile                                                     [auto]
function onDrop(e: DragEvent): void {
  e.preventDefault();
  over.value = false;
  handleFile(e.dataTransfer?.files?.[0]);
}
</script>

<template>
  <div>
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-xl p-6 text-center transition-all"
      :style="{
        border: `2px dashed ${over ? 'var(--accent)' : '#33333A'}`,
        backgroundColor: over ? mix(8) : '#0F0F12',
      }"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop="onDrop"
    >
      <div class="text-2xl" :style="{ color: over ? 'var(--accent)' : '#555' }">⬇</div>
      <div class="text-[#C8C8C8]" :style="{ fontSize: '14px' }">Drop a <b>.mns</b> / <b>.rkz</b> vault here</div>
      <div class="text-gray-600" :style="{ fontSize: '12px' }">or use Import Vault below</div>
    </div>
    <p v-if="note" class="mt-2" :style="{ fontSize: '12px', color: '#8AE28A' }">{{ note }}</p>
  </div>
</template>
