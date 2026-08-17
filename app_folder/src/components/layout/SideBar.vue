<script setup lang="ts">
// Left sidebar: brand + search + tree + settings gear.

// ========== 1. IMPORTS ==========
import { ref } from "vue";
import TreeView from "@/components/tree/TreeView.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { useLibrary } from "@/composables/library";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const emit = defineEmits<{ "open-settings": [] }>();
const query = ref("");

const { create } = useLibrary();

// "New Subject / Folder" dialog — the only way to start a NEW subject, and
// where folders are born (a folder is just a card path; disk follows on save).
const newOpen = ref(false);
const newSubject = ref("");
const newFolder = ref("");

// ========== 5. LOGIC ==========

// ----- createSubject -----
// purpose:   create the subject's first card (optionally inside a typed folder) and close the dialog
// io:        in → none | out → none (no-op when the name is blank)
// processes: create                                                        [auto]
function createSubject(): void {
  const s = newSubject.value.trim();
  if (!s) return;
  create(s, newFolder.value.trim());
  newOpen.value = false;
  newSubject.value = "";
  newFolder.value = "";
}
</script>

<template>
  <aside class="flex h-full flex-col border-r border-[#161618] bg-[#0B0B0D]">
    <div class="border-b border-[#161618] px-4 pb-4 pt-4">

      <!-- Brand & Version -->
      <div class="mb-5 flex items-center gap-2.5">
        <span class="h-5 w-5 rounded-md" style="background: var(--accent)" />
        <span class="text-[#f0f0f0]" :style="{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.14em' }">RAKZ</span>
        <span class="rounded border border-[#222] bg-[#161618] px-1.5 py-0.5 text-[10px] font-bold text-gray-500">v0.1.0</span>
      </div>

      <!-- Add New Mnemonic Button (Wired to Engine) -->
      <button
        @click="create()"
        class="mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-800/40 bg-transparent py-2 text-[13px] font-semibold text-cyan-400 transition-all hover:bg-cyan-900/20 hover:border-cyan-600/60"
      >
        <span class="text-[16px] leading-none">+</span> New Mnemonic
      </button>

      <button
        @click="newOpen = true"
        class="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#222] bg-transparent py-1.5 text-[12px] text-gray-500 transition-all hover:text-gray-300 hover:border-[#333]"
      >
        <span class="text-[14px] leading-none">⊞</span> New Subject / Folder…
      </button>

      <!-- Search -->
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-500">⌕</span>
        <input
          id="rkz-search"
          v-model="query"
          placeholder="Search memonics…"
          class="w-full rounded-lg border border-[#222] bg-[#0F0F12] py-2 pl-[32px] pr-3 text-[13px] text-[#e8e8e8] outline-none transition-colors focus:border-cyan-800/50 placeholder-gray-600"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <TreeView :query="query" />
    </div>

    <div class="border-t border-[#161618] px-3 py-2.5">
      <button
        class="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-1 py-1.5 text-[13px] text-[#9A9AA2] hover:text-white transition-colors"
        @click="emit('open-settings')"
      >
        <span class="text-[15px]">⚙</span> Settings
      </button>
    </div>

    <Dialog :open="newOpen" width="440px" @close="newOpen = false">
      <div class="flex flex-col gap-3 p-6">
        <h3 class="m-0 text-[#f0f0f0]" :style="{ fontSize: '15px', fontWeight: 700 }">New Subject</h3>
        <input
          v-model="newSubject"
          placeholder="Subject name — e.g. Physics"
          class="w-full rounded-lg border border-[#222] bg-[#0F0F12] px-3 py-2 text-[13px] text-[#e8e8e8] outline-none focus:border-cyan-800/50"
          @keydown.enter="createSubject"
        />
        <input
          v-model="newFolder"
          placeholder="Folder (optional) — e.g. science/physics"
          class="w-full rounded-lg border border-[#222] bg-[#0F0F12] px-3 py-2 text-[12px] text-[#9A9AA2] outline-none focus:border-cyan-800/50"
          :style="{ fontFamily: 'JetBrains Mono, monospace' }"
          @keydown.enter="createSubject"
        />
        <p class="m-0 text-gray-600" :style="{ fontSize: '11px' }">The subject's first card is created for you; its .mns file (and folders) appear in the vault on the next save.</p>
        <div class="flex justify-end gap-2 pt-1">
          <button class="cursor-pointer rounded-md border border-[#2C2C2C] bg-transparent px-3 py-1.5 text-[12px] text-[#9A9AA2]" @click="newOpen = false">Cancel</button>
          <button
            class="cursor-pointer rounded-md border-0 px-3 py-1.5 text-[12px] font-bold"
            :style="{ backgroundColor: newSubject.trim() ? '#0891b2' : '#1E1E22', color: newSubject.trim() ? '#000' : '#555', cursor: newSubject.trim() ? 'pointer' : 'default' }"
            @click="createSubject"
          >Create</button>
        </div>
      </div>
    </Dialog>
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #1E1E22; border-radius: 10px; }
.custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: #2C2C30; }
</style>
