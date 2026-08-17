<script setup lang="ts">
// Settings modal — General / Appearance / Data & Storage / Shortcuts.
// Color wheel sits ABOVE the swatch grid (Appearance). I/O lives in Data & Storage.

// ========== 1. IMPORTS ==========
import { computed, onMounted, ref } from "vue";
import { mix, SWATCHES } from "@/lib/utils";
import Dialog from "@/components/ui/Dialog.vue";
import ColorWheel from "@/components/ui/ColorWheel.vue";
import KitDropZone from "@/components/ui/KitDropZone.vue";
import { useLibrary } from "@/composables/library";
import { useAgent } from "@/composables/useAgent";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
const TABS = ["General", "Appearance", "AI", "Data & Storage", "Shortcuts"];

const SHORTCUTS = [
  { keys: "⌘/Ctrl N", label: "New memonic" },
  { keys: "⌘/Ctrl K", label: "Focus search" },
  { keys: "⌘/Ctrl G", label: "Cycle view (Stack → Graph → Grid)" },
  { keys: "⌘/Ctrl .", label: "Zen Mode" },
  { keys: "⌘/Ctrl S", label: "Save vault now" },
];

// ========== 4. STATE ==========
defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits<{ close: [] }>();

const { subjects, activeSubject, setSubjectColor, exportVault, importVault, vaultPath, openVaultFolder, isDesktop, vaultStats, estimateVaultBytes, exportSettings, importSettings, lastImportFailed, clearImportFailure } = useLibrary();

const tab = ref("Appearance");

// Reactive size label: vaultStats read forces recompute after any mutation.
const sizeLabel = computed(() => {
  void vaultStats.value;
  const b = estimateVaultBytes();
  return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
});

// Which subject's color we're editing (defaults to the active card's subject).
const editId = ref<string | null>(null);

// ── AI tab state ──
const {
  keyStatus, keychainError, models, model, busy, error: agentError,
  storeKey, removeKey, refreshKeyStatus, refreshModels, setModel, testConnection,
} = useAgent();

const keyValue = ref("");           // the input — cleared right after save, never echoed back
const keySavedFlash = ref(false);   // "Saved ✓" flash (the key itself is NEVER shown)
const confirmRemove = ref(false);   // two-step arm→confirm for Remove key
const testing = ref(false);
const testResult = ref("");         // "" | "OK ✓" | the error message
const sessionFlash = ref(false);    // "session key stored" flash for the fallback path
const modelQuery = ref("");         // search filter for the model picker
const freeOnly = ref(false);        // quick toggle: show only free models

onMounted(() => {
  void refreshKeyStatus();
  void refreshModels();
});

// ========== 5. LOGIC ==========

// ----- targetId -----
// purpose:   which subject the Appearance tab edits — explicitly picked, else the active card's
// io:        in → none | out → string | undefined
// processes: none                                                        [auto]
function targetId(): string | undefined {
  return editId.value ?? activeSubject.value?.id;
}

// ----- colorOf -----
// purpose:   the current color of the edit target
// io:        in → none | out → string (hex)
// processes: none                                                        [auto]
function colorOf(): string {
  return subjects.value.find((s) => s.id === targetId())?.color || "#00E5FF";
}

// ----- saveApiKey -----
// purpose:   persist the typed key (keychain, or session RAM when unavailable) and clear the input immediately — the value is never kept anywhere else
// io:        in → none | out → none
// processes: storeKey, refreshModels                                     [auto]
async function saveApiKey(): Promise<void> {
  if (!keyValue.value.trim()) return;
  const wasUnavailable = keyStatus.value === "unavailable";
  await storeKey(keyValue.value);
  keyValue.value = "";              // never echo the key back
  if (wasUnavailable) {
    sessionFlash.value = true;
    setTimeout(() => (sessionFlash.value = false), 4000);
  } else {
    keySavedFlash.value = true;
    setTimeout(() => (keySavedFlash.value = false), 2000);
  }
  void refreshModels();
}

// ----- removeApiKey -----
// purpose:   two-step remove — first click arms (3s auto-disarm), second click deletes the key
// io:        in → none | out → none
// processes: removeKey                                                   [auto]
async function removeApiKey(): Promise<void> {
  if (!confirmRemove.value) {
    confirmRemove.value = true;
    setTimeout(() => (confirmRemove.value = false), 3000);
    return;
  }
  confirmRemove.value = false;
  await removeKey();
  testResult.value = "";
}

// ----- runTest -----
// purpose:   one-round-trip health check — show "OK ✓" or the verbatim error
// io:        in → none | out → none
// processes: testConnection                                              [auto]
async function runTest(): Promise<void> {
  testing.value = true;
  testResult.value = "";
  const ok = await testConnection();
  testResult.value = ok ? "OK ✓" : agentError.value || "Test failed.";
  testing.value = false;
}

// ----- filteredModels -----
// purpose:   the model list narrowed by the search box — free models always come first, and the currently selected model stays visible even when it does not match
// io:        in → none | out → ModelInfo[]
// processes: none                                                        [auto]
const filteredModels = computed(() => {
  const q = modelQuery.value.trim().toLowerCase();
  const match = (m: { id: string; name: string }) =>
    !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  const hits = models.value.filter((m) => match(m) && (!freeOnly.value || m.free));
  const selected = models.value.find((m) => m.id === model.value);
  // keep the selection pickable even if it falls outside the filter
  if (selected && !hits.includes(selected)) hits.unshift(selected);
  return hits;
});

// ----- freeCount -----
// purpose:   "N free" headline for the model picker
// io:        in → none | out → number
// processes: none                                                        [auto]
const freeCount = computed(() => models.value.filter((m) => m.free).length);
</script>

<template>
  <Dialog :open="open" width="720px" @close="emit('close')">
    <div class="flex min-h-[440px]">
      <!-- Tab rail -->
      <nav class="flex w-[180px] flex-col gap-1 border-r border-[#222] px-3 py-5">
        <h3 class="mx-2 mb-3 mt-0 text-[#f0f0f0]" :style="{ fontSize: '15px', fontWeight: 700 }">Settings</h3>
        <button
          v-for="t in TABS"
          :key="t"
          class="rounded-md px-2.5 py-2 text-left text-[13px]"
          :style="{
            cursor: 'pointer', border: 'none',
            color: tab === t ? '#f0f0f0' : '#9A9AA2',
            backgroundColor: tab === t ? '#1B1B1F' : 'transparent',
          }"
          @click="tab = t"
        >{{ t }}</button>
      </nav>

      <!-- Panel -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- General -->
        <div v-if="tab === 'General'" class="flex flex-col gap-3.5">
          <h4 class="m-0" :style="{ fontSize: '15px', fontWeight: 700 }">General</h4>

          <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-4">
            <div class="mb-3 flex items-center gap-3">
              <span class="h-9 w-9 rounded-lg" style="background: var(--accent)"></span>
              <div>
                <div class="text-[#f0f0f0]" :style="{ fontSize: '14px', fontWeight: 700 }">RAKZ <span class="ml-1 text-gray-500" :style="{ fontSize: '11px' }">v0.1.0</span></div>
                <div class="text-gray-600" :style="{ fontSize: '11px' }">Mnemonic vault · {{ isDesktop ? 'Tauri desktop' : 'Browser session' }}</div>
              </div>
            </div>
            <div class="flex flex-col gap-1" :style="{ fontSize: '12px' }">
              <div class="flex justify-between"><span class="text-gray-600">MNS format</span><span class="text-[#C8C8C8]" :style="{ fontFamily: 'JetBrains Mono, monospace' }">0.1</span></div>
              <div class="flex justify-between"><span class="text-gray-600">Parser</span><span class="text-[#C8C8C8]" :style="{ fontFamily: 'JetBrains Mono, monospace' }">@rakz-app/mns-parser 0.1.0</span></div>
              <div class="flex justify-between"><span class="text-gray-600">App identifier</span><span class="text-[#C8C8C8]" :style="{ fontFamily: 'JetBrains Mono, monospace' }">com.rakz.app</span></div>
              <div class="flex justify-between"><span class="text-gray-600">Repository</span><span class="text-[#C8C8C8]" :style="{ fontFamily: 'JetBrains Mono, monospace' }">github.com/rakz-app/rakz</span></div>
            </div>
          </div>

          <p class="text-gray-600" :style="{ fontSize: '13px' }">{{ subjects.length }} subjects in this vault.</p>
        </div>

        <!-- Appearance -->
        <div v-else-if="tab === 'Appearance'" class="flex flex-col gap-4">
          <h4 class="m-0" :style="{ fontSize: '15px', fontWeight: 700 }">Appearance</h4>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in subjects"
              :key="s.id"
              class="rounded-md px-2.5 py-1 text-[12px]"
              :style="{
                cursor: 'pointer',
                border: `1px solid ${targetId() === s.id ? 'var(--accent)' : '#2C2C2C'}`,
                color: targetId() === s.id ? '#f0f0f0' : '#9A9AA2',
                backgroundColor: '#0F0F12',
              }"
              @click="editId = s.id"
            >{{ s.name }}</button>
          </div>

          <p class="text-[#9A9AA2]" :style="{ fontSize: '13px' }">Accent color for <b>{{ targetId() }}</b>.</p>

          <ColorWheel :model-value="colorOf()" @update:model-value="targetId() && setSubjectColor(targetId()!, $event)" />

          <div class="flex flex-wrap gap-2.5">
            <button
              v-for="c in SWATCHES"
              :key="c"
              class="h-7 w-7 rounded-md"
              :style="{ backgroundColor: c, cursor: 'pointer', border: '2px solid ' + (colorOf() === c ? '#fff' : 'transparent') }"
              @click="targetId() && setSubjectColor(targetId()!, c)"
            />
          </div>
        </div>

        <!-- AI -->
        <div v-else-if="tab === 'AI'" class="flex flex-col gap-4">
          <h4 class="m-0" :style="{ fontSize: '15px', fontWeight: 700 }">AI</h4>

          <!-- key status: three deliberately distinct states -->
          <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3.5">
            <div class="mb-1.5 text-gray-600" :style="{ fontSize: '12px' }">OpenRouter API key</div>

            <!-- stored -->
            <p v-if="keyStatus === 'stored' && !sessionFlash" class="m-0" :style="{ fontSize: '12px', color: '#4ade80' }">● Key stored in the OS keychain</p>
            <p v-else-if="keyStatus === 'stored' && sessionFlash" class="m-0" :style="{ fontSize: '12px', color: '#fbbf24' }">● Session-only key stored (keychain unavailable on this system — it dies when the app closes)</p>
            <!-- unset -->
            <p v-else-if="keyStatus === 'unset'" class="m-0" :style="{ fontSize: '12px', color: '#9A9AA2' }">○ Not configured — paste a key from openrouter.ai/keys</p>
            <!-- unavailable: verbatim Rust error -->
            <p v-else class="m-0" :style="{ fontSize: '12px', color: '#f87171' }">⚠ Keychain unavailable:<br /><code :style="{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }">{{ keychainError }}</code><br />You can store a session-only key below (RAM, this app run only).</p>

            <div class="mt-2.5 flex gap-2">
              <input
                v-model="keyValue"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="sk-or-…"
                class="flex-1 rounded-lg border border-[#222] bg-[#0F0F12] px-3 py-2 text-[13px] text-[#e8e8e8] outline-none focus:border-cyan-800/50"
                :style="{ fontFamily: 'JetBrains Mono, monospace' }"
                @keydown.enter="saveApiKey"
              />
              <button
                class="rounded-lg border-0 px-4 py-2 text-[12px] font-bold"
                :style="{ backgroundColor: keyValue.trim() ? '#0891b2' : '#1E1E22', color: keyValue.trim() ? '#000' : '#555', cursor: keyValue.trim() ? 'pointer' : 'default' }"
                @click="saveApiKey"
              >{{ keySavedFlash ? 'Saved ✓' : 'Save' }}</button>
              <button
                v-if="keyStatus === 'stored'"
                class="rounded-lg px-3 py-2 text-[12px] font-bold"
                :style="{
                  cursor: 'pointer',
                  color: confirmRemove ? '#fecaca' : '#c98a8a',
                  backgroundColor: confirmRemove ? '#7f1d1d' : 'transparent',
                  border: confirmRemove ? '1px solid #ef4444' : '1px solid #2C2C2C',
                }"
                @click="removeApiKey"
              >{{ confirmRemove ? 'Confirm remove?' : 'Remove' }}</button>
            </div>
            <p class="m-0 mt-2 text-gray-600" :style="{ fontSize: '11px' }">The key lives only in the OS keychain — never in settings.json, never in the vault, never on screen after saving.</p>
          </div>

          <!-- model: searchable picker, FREE models first -->
          <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3.5">
            <div class="mb-1.5 flex items-center justify-between">
              <div class="text-gray-600" :style="{ fontSize: '12px' }">Model</div>
              <span :style="{ fontSize: '11px', color: '#4ade80' }">{{ models.length }} models · {{ freeCount }} free</span>
            </div>

            <!-- search + free-only toggle -->
            <div class="mb-2 flex items-center gap-2">
              <div class="relative flex-1">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-500">⌕</span>
                <input
                  v-model="modelQuery"
                  placeholder="Search models… (try: free, gemini, llama)"
                  class="w-full rounded-lg border border-[#222] bg-[#0F0F12] py-1.5 pl-7 pr-3 text-[12px] text-[#e8e8e8] outline-none focus:border-cyan-800/50"
                />
              </div>
              <button
                class="flex-shrink-0 rounded-full px-3 py-1.5"
                :style="{
                  fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  color: freeOnly ? '#4ade80' : '#9A9AA2',
                  border: freeOnly ? '1px solid rgba(74,222,128,0.5)' : '1px solid #2C2C2C',
                  backgroundColor: freeOnly ? 'rgba(74,222,128,0.1)' : 'transparent',
                }"
                @click="freeOnly = !freeOnly"
              >▪ Free only</button>
            </div>

            <div class="flex items-center gap-2.5">
              <div class="flex-1 overflow-y-auto rounded-lg border border-[#222]" :style="{ maxHeight: '220px' }">
                <button
                  v-for="m in filteredModels"
                  :key="m.id"
                  class="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left"
                  :style="{
                    cursor: 'pointer',
                    backgroundColor: model === m.id ? 'rgba(8,145,178,0.18)' : 'transparent',
                    borderBottom: '1px solid #1A1A1E',
                  }"
                  @click="setModel(m.id)"
                >
                  <!-- radio dot -->
                  <span
                    class="flex-shrink-0 rounded-full"
                    :style="{
                      width: '12px', height: '12px',
                      border: `2px solid ${model === m.id ? '#22d3ee' : '#444'}`,
                      backgroundColor: model === m.id ? '#22d3ee' : 'transparent',
                    }"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate" :style="{ fontSize: '12px', fontWeight: 700, color: model === m.id ? '#f0f0f0' : '#C8C8C8' }">{{ m.name }}</span>
                    <span class="block truncate" :style="{ fontSize: '10px', color: '#666', fontFamily: 'JetBrains Mono, monospace' }">{{ m.id }}</span>
                  </span>
                  <span
                    v-if="m.free"
                    class="flex-shrink-0 rounded-full px-2 py-0.5"
                    :style="{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)', backgroundColor: 'rgba(74,222,128,0.08)' }"
                  >FREE</span>
                </button>
                <p v-if="!filteredModels.length" class="m-0 px-3 py-3" :style="{ fontSize: '12px', color: '#666' }">No model matches “{{ modelQuery }}”.</p>
              </div>
              <button
                class="rounded-lg border border-[#2C2C2C] bg-transparent px-3 py-2 text-[12px] text-[#C8C8C8]"
                style="cursor: pointer"
                title="Reload the live model catalog"
                @click="refreshModels"
              >↻</button>
            </div>

            <div class="mt-2.5 flex items-center gap-2.5">
              <button
                class="rounded-lg px-3 py-1.5 text-[12px] font-bold"
                :style="{ backgroundColor: '#0891b2', color: '#000', border: 'none', cursor: 'pointer' }"
                :disabled="busy || testing"
                @click="runTest"
              >{{ testing ? 'Testing…' : 'Test connection' }}</button>
              <span v-if="testResult" :style="{ fontSize: '12px', color: testResult === 'OK ✓' ? '#4ade80' : '#f87171' }">{{ testResult }}</span>
            </div>
          </div>
        </div>

        <!-- Data & Storage -->
        <div v-else-if="tab === 'Data & Storage'" class="flex flex-col gap-4">
          <h4 class="m-0" :style="{ fontSize: '15px', fontWeight: 700 }">Data &amp; Storage</h4>

          <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3.5">
            <div class="mb-1.5 text-gray-600" :style="{ fontSize: '12px' }">Vault location</div>
            <div class="flex items-center gap-2.5">
              <code class="flex-1 break-all text-[#C8C8C8]" :style="{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }">{{ vaultPath }}</code>
              <button v-if="isDesktop" class="rounded-md border border-[#2C2C2C] bg-transparent px-2.5 py-1.5 text-[12px] text-[#C8C8C8]" style="cursor: pointer" @click="openVaultFolder">Open Folder</button>
            </div>
          </div>

          <div>
            <div class="mb-1.5 text-gray-600" :style="{ fontSize: '12px' }">Vault statistics</div>
            <div class="grid grid-cols-4 gap-2.5">
              <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3 text-center">
                <div :style="{ fontSize: '18px', fontWeight: 700, color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }">{{ vaultStats.cards }}</div>
                <div class="text-gray-600" :style="{ fontSize: '10px' }">Total Mnemonics</div>
              </div>
              <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3 text-center">
                <div :style="{ fontSize: '18px', fontWeight: 700, color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }">{{ vaultStats.links }}</div>
                <div class="text-gray-600" :style="{ fontSize: '10px' }">Links</div>
              </div>
              <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3 text-center">
                <div :style="{ fontSize: '18px', fontWeight: 700, color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }">{{ vaultStats.subjects }}</div>
                <div class="text-gray-600" :style="{ fontSize: '10px' }">Subjects</div>
              </div>
              <div class="rounded-xl border border-[#222] bg-[#0F0F12] p-3 text-center">
                <div :style="{ fontSize: '18px', fontWeight: 700, color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }">{{ sizeLabel }}</div>
                <div class="text-gray-600" :style="{ fontSize: '10px' }">Disk (est.)</div>
              </div>
            </div>
          </div>

          <KitDropZone />

          <div class="flex gap-2.5">
            <button
              class="flex-1 rounded-lg border-0 py-2.5 text-[13px]"
              :style="{ backgroundColor: mix(90), color: '#06070A', fontWeight: 500, cursor: 'pointer' }"
              @click="exportVault"
            >{{ isDesktop ? 'Save & Show Vault (.mns)' : 'Export Vault (.mns)' }}</button>
            <button
              class="flex-1 rounded-lg border border-[#2C2C2C] bg-transparent py-2.5 text-[13px] text-[#C8C8C8]"
              style="cursor: pointer"
              @click="importVault(); clearImportFailure()"
            >Import Vault (.mns / .rkz)</button>
          </div>
          <p v-if="lastImportFailed" class="m-0" :style="{ fontSize: '12px', color: '#f87171' }">
            That file is not a valid RAKZ vault (.mns or .rkz).
          </p>

          <div class="flex gap-2.5">
            <button
              class="flex-1 rounded-lg border border-[#2C2C2C] bg-transparent py-2 text-[12px] text-[#9A9AA2]"
              style="cursor: pointer"
              @click="exportSettings"
            >Share Settings (.json)</button>
            <button
              class="flex-1 rounded-lg border border-[#2C2C2C] bg-transparent py-2 text-[12px] text-[#9A9AA2]"
              style="cursor: pointer"
              @click="importSettings"
            >Import Settings (.json)</button>
          </div>
          <p class="m-0 text-gray-600" :style="{ fontSize: '11px' }">settings.json carries subject colors today (language/font/theme keys are reserved and round-tripped) — trade it with friends to share skins.</p>
        </div>

        <!-- Shortcuts -->
        <div v-else class="flex flex-col gap-2.5">
          <h4 class="m-0" :style="{ fontSize: '15px', fontWeight: 700 }">Keyboard Shortcuts</h4>
          <div
            v-for="s in SHORTCUTS"
            :key="s.label"
            class="flex items-center justify-between border-b border-[#1A1A1E] py-2"
          >
            <span class="text-[#C8C8C8]" :style="{ fontSize: '13px' }">{{ s.label }}</span>
            <kbd class="rounded-md border border-[#2C2C2C] bg-[#161618] px-2 py-0.5 text-[#9A9AA2]" :style="{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }">{{ s.keys }}</kbd>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>
