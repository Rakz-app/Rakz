<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { computed, ref } from "vue";
import { useLibrary } from "@/composables/library";
import StarRating from "@/components/ui/StarRating.vue";

// ========== 2. TYPES ==========
// (props declared via runtime declaration below)

// ========== 3. CONSTANTS ==========
const SORTS = [
  { id: "recent", label: "Recent" },
  { id: "importance", label: "Importance" },
  { id: "linked", label: "Most Linked" },
];

// ========== 4. STATE ==========
const props = defineProps({
  view: { type: String, default: "stack" },
  sort: { type: String, default: "recent" },
  filterTag: { type: String, default: "" },
  zen: { type: Boolean, default: false },
});

const emit = defineEmits<{
  "update:view": [view: string];
  "update:sort": [sort: string];
  "update:filterTag": [tag: string];
  "update:zen": [zen: boolean];
}>();

const { activeSubject, active } = useLibrary();

// The Advanced drawer holds Filter + View + Zen so the main row always fits.
// The toggle glows when anything inside it deviates from the defaults.
const adv = ref(false);
const advActive = computed(() => !!props.filterTag || props.view !== "stack" || props.zen);

// ========== 5. LOGIC ==========
// (render-only — no local logic beyond the drawer state above)
</script>

<template>
  <header :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: '10px', columnGap: '16px', padding: '12px 24px', backgroundColor: '#09090B', borderBottom: '1px solid #161618', fontFamily: 'system-ui, -apple-system, sans-serif' }">

    <!-- MAIN ROW · LEFT: context -->
    <div :style="{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px', rowGap: '10px', minWidth: 0 }">

      <!-- Subject Info -->
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
        <span :style="{ fontSize: '11px', color: '#555', fontWeight: 600 }">Subject:</span>
        <div v-if="activeSubject" :style="{ padding: '3px 8px', backgroundColor: `${activeSubject.color}15`, border: `1px solid ${activeSubject.color}30`, borderRadius: '6px', color: activeSubject.color, fontSize: '11px', fontWeight: 700 }">
           {{ activeSubject.name }}
        </div>
        <div v-else :style="{ padding: '3px 8px', backgroundColor: '#1A1A1E', borderRadius: '6px', color: '#666', fontSize: '11px', fontWeight: 700 }">All</div>
      </div>

      <!-- Strength -->
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
        <span :style="{ fontSize: '11px', color: '#555', fontWeight: 600 }">Strength:</span>
        <StarRating :model-value="active?.importance || 0" :readonly="true" />
      </div>

      <div :style="{ width: '1px', height: '14px', backgroundColor: '#222' }"></div>

      <!-- Sort -->
      <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
        <span :style="{ fontSize: '11px', color: '#555', fontWeight: 600 }">≡ Sort:</span>
        <select
          :value="sort" @change="emit('update:sort', ($event.target as HTMLSelectElement).value)"
          :style="{ backgroundColor: 'transparent', border: 'none', color: '#22d3ee', fontSize: '12px', fontWeight: 700, outline: 'none', cursor: 'pointer' }"
        >
          <option v-for="o in SORTS" :key="o.id" :value="o.id" :style="{ backgroundColor: '#0F0F12', color: '#fff' }">{{ o.label }}</option>
        </select>
      </div>
    </div>

    <!-- MAIN ROW · RIGHT: the Advanced toggle (never squeezed out) -->
    <button
      @click="adv = !adv"
      :style="{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', flexShrink: 0,
        backgroundColor: adv ? 'rgba(8,145,178,0.2)' : 'transparent',
        border: (adv || advActive) ? '1px solid rgba(8,145,178,0.5)' : '1px solid #222',
        borderRadius: '8px', color: (adv || advActive) ? '#22d3ee' : '#666',
        fontSize: '11px', fontWeight: 700, cursor: 'pointer',
      }"
    >
      <span :style="{ fontSize: '12px' }">⚙</span> Advanced
      <span v-if="advActive && !adv" :style="{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#22d3ee' }"></span>
    </button>

    <!-- ADVANCED DRAWER: Filter · View · Zen -->
    <div v-if="adv" :style="{ flexBasis: '100%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }">

      <!-- Filter -->
      <div :style="{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 180px', maxWidth: '320px' }">
        <span :style="{ position: 'absolute', left: '10px', color: '#22d3ee', fontSize: '12px' }">⌕</span>
        <input
          :value="filterTag" @input="emit('update:filterTag', ($event.target as HTMLInputElement).value)"
          placeholder="Filter by #hashtag..."
          :style="{ width: '100%', backgroundColor: 'transparent', border: '1px solid #222', borderRadius: '8px', padding: '6px 12px 6px 28px', color: '#fff', fontSize: '12px', outline: 'none' }"
        />
      </div>

      <!-- View group -->
      <div :style="{ display: 'flex', backgroundColor: '#0F0F12', border: '1px solid #222', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }">
        <button
          @click="emit('update:view', 'stack')"
          :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', border: 'none', backgroundColor: view === 'stack' ? 'rgba(8,145,178,0.2)' : 'transparent', color: view === 'stack' ? '#22d3ee' : '#666', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }"
        >
          <span :style="{ fontSize: '12px' }">▤</span> Stack View
        </button>
        <div :style="{ width: '1px', backgroundColor: '#222' }"></div>
        <button
          @click="emit('update:view', 'graph')"
          :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', border: 'none', backgroundColor: view === 'graph' ? 'rgba(8,145,178,0.2)' : 'transparent', color: view === 'graph' ? '#22d3ee' : '#666', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }"
        >
          <span :style="{ fontSize: '12px' }">◉</span> Graph
        </button>
        <div :style="{ width: '1px', backgroundColor: '#222' }"></div>
        <button
          @click="emit('update:view', 'grid')"
          :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', border: 'none', backgroundColor: view === 'grid' ? 'rgba(8,145,178,0.2)' : 'transparent', color: view === 'grid' ? '#22d3ee' : '#666', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }"
        >
          <span :style="{ fontSize: '12px' }">⊞</span> Grid View
        </button>
      </div>

      <!-- Zen Toggle -->
      <button
        @click="emit('update:zen', !zen)"
        :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', flexShrink: 0, backgroundColor: zen ? 'rgba(8,145,178,0.2)' : 'transparent', border: zen ? '1px solid rgba(8,145,178,0.5)' : '1px solid #222', borderRadius: '8px', color: zen ? '#22d3ee' : '#666', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }"
      >
        <span :style="{ fontSize: '12px' }">⛶</span> Zen
      </button>

    </div>
  </header>
</template>
