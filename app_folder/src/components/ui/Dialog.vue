<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { onBeforeUnmount, onMounted } from "vue";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
// (none)

// ========== 5. LOGIC ==========
const props = defineProps({ open: { type: Boolean, default: false }, width: { type: String, default: "640px" } });
const emit = defineEmits<{ close: [] }>();

// ----- onKey -----
// purpose:   close the modal on Escape
// io:        in → e (KeyboardEvent) | out → none
// processes: none                                                        [auto]
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.open) emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      @click.self="emit('close')"
      :style="{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(4,5,8,0.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }"
    >
      <div
        :style="{
          width: width, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto',
          backgroundColor: 'rgba(18,18,22,0.92)', border: '1px solid #2C2C2C', borderRadius: '16px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
