<script setup lang="ts">
// Ask AI dialog — question box over the current context (bulk selection if
// any, else the active card). Busy state, selectable answer + Copy, error line.

// ========== 1. IMPORTS ==========
import { ref } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import { useAgent } from "@/composables/useAgent";
import { copyToClipboard } from "@/composables/library/persistence";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const { open, busy, answer, error, contextCount, ask, closeAsk } = useAgent();

const question = ref("");
const copied = ref(false);

// ========== 5. LOGIC ==========

// ----- submit -----
// purpose:   fire the question and keep it in the box (follow-ups are common)
// io:        in → none | out → none
// processes: ask                                                          [auto]
async function submit(): Promise<void> {
  if (!question.value.trim() || busy.value) return;
  await ask(question.value);
}

// ----- copyAnswer -----
// purpose:   copy the answer text and flash a confirmation
// io:        in → none | out → none
// processes: copyToClipboard                                              [auto]
async function copyAnswer(): Promise<void> {
  if (await copyToClipboard(answer.value)) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }
}
</script>

<template>
  <Dialog :open="open" width="640px" @close="closeAsk">
    <div class="flex flex-col gap-3 p-6">
      <div class="flex items-center justify-between">
        <h3 class="m-0 text-[#f0f0f0]" :style="{ fontSize: '15px', fontWeight: 700 }">✦ Ask AI</h3>
        <span :style="{ fontSize: '11px', fontWeight: 700, color: '#0891b2', backgroundColor: 'rgba(8,145,178,0.15)', padding: '2px 8px', borderRadius: '4px' }">Context: {{ contextCount }} card(s)</span>
      </div>

      <!-- question -->
      <textarea
        v-model="question"
        placeholder="Ask about the selected cards…"
        class="w-full resize-vertical outline-none"
        :style="{ minHeight: '72px', backgroundColor: '#0F0F12', border: '1px solid #222', borderRadius: '8px', padding: '10px 12px', color: '#e8e8e8', fontSize: '13px', lineHeight: 1.5, boxSizing: 'border-box' }"
        @keydown.enter.exact.prevent="submit"
      />

      <div class="flex items-center justify-between">
        <span :style="{ fontSize: '10px', color: '#555' }">Enter to ask · Shift+Enter for a new line</span>
        <button
          class="rounded-md border-0 px-4 py-1.5 text-[12px] font-bold"
          :style="{ backgroundColor: question.trim() && !busy ? '#0891b2' : '#1E1E22', color: question.trim() && !busy ? '#000' : '#555', cursor: question.trim() && !busy ? 'pointer' : 'default' }"
          @click="submit"
        >{{ busy ? 'Asking…' : 'Ask' }}</button>
      </div>

      <!-- answer -->
      <div v-if="answer" :style="{ backgroundColor: '#0F0F12', border: '1px solid rgba(8,145,178,0.3)', borderRadius: '8px', padding: '14px' }">
        <div class="mb-2 flex items-center justify-between">
          <span :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase' }">Answer</span>
          <button
            :style="{ fontSize: '11px', color: copied ? '#8AE28A' : '#22d3ee', backgroundColor: 'transparent', border: '1px solid rgba(8,145,178,0.4)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }"
            @click="copyAnswer"
          >{{ copied ? 'Copied ✓' : 'Copy' }}</button>
        </div>
        <p class="m-0 select-text" :style="{ fontSize: '13px', color: '#D1D1D6', lineHeight: 1.6, whiteSpace: 'pre-wrap' }">{{ answer }}</p>
      </div>

      <!-- error -->
      <p v-if="error" class="m-0" :style="{ fontSize: '12px', color: '#f87171' }">{{ error }}</p>
    </div>
  </Dialog>
</template>
