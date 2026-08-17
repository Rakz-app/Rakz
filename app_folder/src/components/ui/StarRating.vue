<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { ref } from "vue";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const hover = ref(0);

// ========== 5. LOGIC ==========
const props = defineProps({
  modelValue: { type: Number, required: true },
  size: { type: Number, default: 19 },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
void props; // template-only — keeps the runtime declaration referenced
</script>

<template>
  <div :style="{ display: 'flex', gap: '3px', alignItems: 'center' }">
    <button
      v-for="i in 5"
      :key="i"
      type="button"
      :disabled="readonly"
      @click="!readonly && emit('update:modelValue', i)"
      @mouseenter="!readonly && (hover = i)"
      @mouseleave="hover = 0"
      :style="{ background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer', padding: '1px', lineHeight: 0 }"
    >
      <svg :width="size" :height="size" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 1.5L8.545 5.28L12.5 5.635L9.625 8.155L10.545 12.05L7 9.965L3.455 12.05L4.375 8.155L1.5 5.635L5.455 5.28L7 1.5Z"
          :fill="i <= (hover || modelValue) ? '#FFB800' : 'none'"
          :stroke="i <= (hover || modelValue) ? '#FFB800' : '#555'"
          stroke-width="1.2" stroke-linejoin="round"
        />
      </svg>
    </button>
    <span :style="{ fontSize: '13px', color: '#666', marginLeft: '5px' }">{{ modelValue }}/5</span>
  </div>
</template>
