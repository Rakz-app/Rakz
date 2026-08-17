<script setup lang="ts">
// Hashtag token input. Emits the full next array on change; the card routes it
// through useLibrary.setTags (which diffs and calls addTag/removeTag on the engine).
// A tag that also lives on a card in ANOTHER subject (different engine `id`) glows.

// ========== 1. IMPORTS ==========
import { ref } from "vue";
import { mix } from "@/lib/utils";
import { useLibrary } from "@/composables/library";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const props = defineProps({
  modelValue: { type: Array as () => string[], required: true },  // string[]
  activeSubjectId: { type: String, default: "" },                 // engine `id` of the card's subject
});
const emit = defineEmits<{ "update:modelValue": [tags: string[]] }>();

const { memonics } = useLibrary();
const draft = ref("");

// ========== 5. LOGIC ==========

// ----- isCross -----
// purpose:   does this tag also appear on a card in a DIFFERENT subject? (the glow rule)
// io:        in → t (string) | out → boolean
// processes: none                                                        [auto]
function isCross(t: string): boolean {
  return (
    !!props.activeSubjectId &&
    memonics.value.some((m) => m.id !== props.activeSubjectId && m.tags.some((x) => x.toLowerCase() === t.toLowerCase()))
  );
}

// ----- add -----
// purpose:   clean one raw token (#/commas stripped) and append it case-insensitively unique
// io:        in → raw (string) | out → none (emits the next array; clears draft)
// processes: none                                                        [auto]
function add(raw: string): void {
  const clean = raw.trim().replace(/^#/, "").replace(/,/g, "");
  if (clean && !props.modelValue.some((x) => x.toLowerCase() === clean.toLowerCase())) {
    emit("update:modelValue", [...props.modelValue, clean]);
  }
  draft.value = "";
}

// ----- remove -----
// purpose:   drop one exact tag from the array
// io:        in → t (string) | out → none
// processes: none                                                        [auto]
function remove(t: string): void {
  emit("update:modelValue", props.modelValue.filter((x) => x !== t));
}

// ----- onKeydown -----
// purpose:   Enter/comma commits the draft; Backspace on an empty draft removes the last tag
// io:        in → e (KeyboardEvent) | out → none
// processes: add, remove                                                  [auto]
function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    add(draft.value);
  } else if (e.key === "Backspace" && !draft.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]!);
  }
}
</script>

<template>
  <div class="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg border border-[#2C2C2C] bg-[#0F0F12] px-3 py-2">
    <span
      v-for="t in modelValue"
      :key="t"
      class="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1"
      :style="{
        fontSize: '14px', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)',
        backgroundColor: mix(12),
        border: isCross(t) ? '1px solid var(--accent)' : `1px solid ${mix(28)}`,
        boxShadow: isCross(t) ? `0 0 12px ${mix(45)}` : 'none',
      }"
    >
      #{{ t }}
      <button
        type="button"
        title="Remove tag"
        class="flex h-[18px] w-[18px] items-center justify-center rounded-full border-0"
        :style="{ backgroundColor: mix(22), color: 'var(--accent)', cursor: 'pointer', padding: 0 }"
        @click="remove(t)"
      >✕</button>
    </span>
    <input
      v-model="draft"
      :placeholder="modelValue.length ? 'Add tag…' : 'Type a tag and press Enter…'"
      class="min-w-[120px] flex-1 border-0 bg-transparent text-[#C8C8C8] outline-none"
      :style="{ fontSize: '14px', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }"
      @keydown="onKeydown"
      @blur="draft && add(draft)"
    />
  </div>
</template>
