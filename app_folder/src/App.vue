<script setup lang="ts">
// Root shell. Fills the OS window with a responsive three-pane layout.
// Owns panel widths, view/sort/filter/zen state, keyboard shortcuts, settings.
// All DATA comes from useLibrary — App never touches the engine directly.

// ========== 1. IMPORTS ==========
import { onBeforeUnmount, onMounted, ref } from "vue";
import SideBar from "@/components/layout/SideBar.vue";
import TopBar from "@/components/layout/TopBar.vue";
import MnemonicViewer from "@/components/viewer/MnemonicViewer.vue";
import RightPanel from "@/components/layout/RightPanel.vue";
import SettingsWindow from "@/components/settings/SettingsWindow.vue";
import Resizer from "@/components/ui/Resizer.vue";
import BulkBar from "@/components/ui/BulkBar.vue";
import AskDialog from "@/components/agent/AskDialog.vue";
import { useLibrary } from "@/composables/library";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const { load, create, saveNow } = useLibrary();

const leftW = ref(280);
const rightW = ref(320);
const view = ref("stack");
const sort = ref("recent");
const filterTag = ref("");
const zen = ref(false);
const settingsOpen = ref(false);

// ========== 5. LOGIC ==========

// ----- resizeLeft -----
// purpose:   apply a left-pane drag delta, clamped to sane widths
// io:        in → dx (number, layout px) | out → none
// processes: none                                                        [auto]
function resizeLeft(dx: number): void {
  leftW.value = Math.max(220, Math.min(460, leftW.value + dx));
}

// ----- resizeRight -----
// purpose:   apply a right-pane drag delta (inverted axis), clamped
// io:        in → dx (number, layout px) | out → none
// processes: none                                                        [auto]
function resizeRight(dx: number): void {
  rightW.value = Math.max(240, Math.min(520, rightW.value - dx));
}

// ----- onKey -----
// purpose:   global shortcuts — ⌘N new · ⌘G cycle view · ⌘. zen · ⌘K search · ⌘S save
// io:        in → e (KeyboardEvent) | out → none
// processes: create, saveNow                                              [auto]
function onKey(e: KeyboardEvent): void {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === "n") {
    e.preventDefault();
    create();
  } else if (k === "g") {
    e.preventDefault();
    view.value = view.value === "stack" ? "graph" : view.value === "graph" ? "grid" : "stack";
  } else if (k === ".") {
    e.preventDefault();
    zen.value = !zen.value;
  } else if (k === "k") {
    e.preventDefault();
    document.getElementById("rkz-search")?.focus();
  } else if (k === "s") {
    e.preventDefault();
    void saveNow();
  }
}

onMounted(() => {
  void load();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="rkz-app flex h-full w-full overflow-hidden bg-[#09090B]">
    <!-- Left sidebar (hidden in Zen) -->
    <template v-if="!zen">
      <div class="h-full flex-shrink-0" :style="{ width: `${leftW}px` }">
        <SideBar @open-settings="settingsOpen = true" />
      </div>
      <Resizer @resize="resizeLeft" />
    </template>

    <!-- Center column -->
    <div class="flex h-full min-w-0 flex-1 flex-col">
      <TopBar
        v-model:view="view"
        v-model:sort="sort"
        v-model:filter-tag="filterTag"
        v-model:zen="zen"
      />
      <MnemonicViewer :view="view" :sort="sort" :filter-tag="filterTag" />
    </div>

    <!-- Right panel (hidden in Zen) -->
    <template v-if="!zen">
      <Resizer @resize="resizeRight" />
      <div class="h-full flex-shrink-0" :style="{ width: `${rightW}px` }">
        <RightPanel />
      </div>
    </template>

    <SettingsWindow :open="settingsOpen" @close="settingsOpen = false" />
    <BulkBar />
    <!-- App-level mount: must NOT live inside SettingsWindow's Dialog, whose
         slot only renders while settings is open (that made Ask AI appear only
         when Settings was open and vanish when it closed). -->
    <AskDialog />
  </div>
</template>
