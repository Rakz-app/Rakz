<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { ref } from "vue";
import { mix } from "@/lib/utils";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const active = ref(false);
const hover = ref(false);

// ========== 5. LOGIC ==========
const props = defineProps({
  scale: { type: Number, default: 1 },   // stage scale so drag deltas map 1:1 to layout px
});
const emit = defineEmits<{ resize: [delta: number] }>();

// ----- onDown -----
// purpose:   start a panel-resize drag — emit deltas in layout px until mouseup
// io:        in → e (MouseEvent) | out → none
// processes: none                                                        [auto]
function onDown(e: MouseEvent): void {
  // 1. arm the drag and remember the previous x
  e.preventDefault();
  active.value = true;
  let prev = e.clientX;
  // 2. every move emits the delta (scaled), every position updates the baseline
  const mm = (ev: MouseEvent) => {
    emit("resize", (ev.clientX - prev) / props.scale);
    prev = ev.clientX;
  };
  // 3. mouseup ends the drag and detaches the listeners
  const mu = () => {
    active.value = false;
    window.removeEventListener("mousemove", mm);
    window.removeEventListener("mouseup", mu);
  };
  window.addEventListener("mousemove", mm);
  window.addEventListener("mouseup", mu);
}
</script>

<template>
  <div
    @mousedown="onDown"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
    :style="{
      width: '8px', minWidth: '8px', height: '100%', cursor: 'col-resize', flexShrink: 0,
      backgroundColor: active ? mix(40) : hover ? mix(20) : '#161618',
      transition: 'background-color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }"
  >
    <div
      :style="{
        width: '4px', height: '46px', borderRadius: '3px', pointerEvents: 'none',
        backgroundColor: (active || hover) ? 'var(--accent)' : '#6A6A72',
        boxShadow: (active || hover) ? `0 0 10px ${mix(80)}` : '0 0 0 1px rgba(0,0,0,0.3)',
        transition: 'all 0.15s',
      }"
    />
  </div>
</template>
