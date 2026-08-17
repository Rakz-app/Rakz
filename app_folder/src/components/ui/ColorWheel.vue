<script setup lang="ts">
// HSV color wheel (hue ring + value slider), sits ABOVE the swatch grid in settings.

// ========== 1. IMPORTS ==========
import { computed, ref, watch } from "vue";
import { hexToHsv, hsvToHex } from "@/lib/utils";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
const SIZE = 160;
const R = SIZE / 2;

// ========== 4. STATE ==========
const props = defineProps({
  modelValue: { type: String, required: true },   // hex
});
const emit = defineEmits<{ "update:modelValue": [hex: string] }>();

const initial = hexToHsv(props.modelValue);
const h = ref(initial.h);
const s = ref(initial.s);
const v = ref(initial.v);
let dragging = false;

// ========== 5. LOGIC ==========
// Keep internal HSV in sync if the parent swaps the hex out from under us.
watch(() => props.modelValue, (hex) => {
  const c = hexToHsv(hex);
  h.value = c.h;
  s.value = c.s;
  v.value = c.v;
});

const hex = computed(() => hsvToHex(h.value, s.value, v.value));

// ----- commit -----
// purpose:   publish the current HSV as the new hex value
// io:        in → none | out → none
// processes: none                                                        [auto]
function commit(): void {
  emit("update:modelValue", hex.value);
}

// ----- pick -----
// purpose:   read the pointer position on the wheel into hue (angle) and saturation (distance)
// io:        in → e (MouseEvent) | out → none
// processes: commit                                                        [auto]
function pick(e: MouseEvent): void {
  // 1. pointer offset from the wheel center
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = e.clientX - rect.left - R;
  const y = e.clientY - rect.top - R;
  // 2. saturation = clamped distance, hue = angle normalized to 0..360
  const dist = Math.min(Math.sqrt(x * x + y * y), R);
  h.value = (Math.atan2(y, x) * 180) / Math.PI;
  if (h.value < 0) h.value += 360;
  s.value = dist / R;
  commit();
}

// ----- onDown -----
// purpose:   start a wheel drag — pick immediately, keep picking on move until mouseup
// io:        in → e (MouseEvent) | out → none
// processes: pick                                                          [auto]
function onDown(e: MouseEvent): void {
  dragging = true;
  pick(e);
  const mu = () => {
    dragging = false;
    window.removeEventListener("mouseup", mu);
  };
  window.addEventListener("mouseup", mu);
}

// ----- onMove -----
// purpose:   keep picking while the drag is armed
// io:        in → e (MouseEvent) | out → none
// processes: pick                                                          [auto]
function onMove(e: MouseEvent): void {
  if (dragging) pick(e);
}

const dotStyle = computed(() => {
  const rad = (h.value * Math.PI) / 180;
  return {
    left: `${R + Math.cos(rad) * s.value * R - 7}px`,
    top: `${R + Math.sin(rad) * s.value * R - 7}px`,
  };
});
</script>

<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }">
    <div
      @mousedown="onDown"
      @mousemove="onMove"
      :style="{
        position: 'relative', width: `${SIZE}px`, height: `${SIZE}px`, borderRadius: '50%', cursor: 'crosshair',
        background: `radial-gradient(circle, #fff 0%, transparent 70%),
          conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)`,
        filter: `brightness(${0.4 + v * 0.6})`, border: '1px solid #2C2C2C',
      }"
    >
      <div :style="{ position: 'absolute', width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 4px rgba(0,0,0,0.6)', pointerEvents: 'none', ...dotStyle }" />
    </div>

    <input
      type="range" min="0" max="100" :value="Math.round(v * 100)"
      @input="v = Number(($event.target as HTMLInputElement).value) / 100; commit()"
      :style="{ width: `${SIZE}px`, accentColor: hex }"
    />

    <div :style="{ display: 'flex', alignItems: 'center', gap: '10px' }">
      <div :style="{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: hex, border: '1px solid #333' }" />
      <span :style="{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: '#C8C8C8' }">{{ hex.toUpperCase() }}</span>
    </div>
  </div>
</template>
