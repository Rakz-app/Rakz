<script setup lang="ts">
// ========== 1. IMPORTS ==========
import { computed } from "vue";
import { useLibrary } from "@/composables/library";
import { useAgent } from "@/composables/useAgent";
import type { Memonic } from "@engine/types";

// ========== 2. TYPES ==========
// (none)

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const { active, subjects, activeLinks, activeSuggestions, link, unlink, select } = useLibrary();
const { openAsk } = useAgent();

// ========== 5. LOGIC ==========

// ----- subjectOf -----
// purpose:   resolve a subject id to its colored projection object
// io:        in → id (string) | out → Subject | undefined
// processes: none                                                        [auto]
function subjectOf(id: string) {
  return subjects.value.find((s) => s.id === id);
}

// ----- linkTitleFor -----
// purpose:   default edge title = the first shared tag (the visible REASON for the suggestion) instead of the meaningless 'manual'; renameable on the card
// io:        in → a, b (Memonic) | out → string ('related' when nothing shared)
// processes: none                                                        [auto]
function linkTitleFor(a: Memonic, b: Memonic): string {
  const bt = new Set(b.tags.map((t) => t.toLowerCase()));
  return a.tags.find((t) => bt.has(t.toLowerCase())) ?? "related";
}

// a null-safe active card for the template
const activeCard = computed(() => active.value);
</script>

<template>
  <aside :style="{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#0B0B0D', borderLeft: '1px solid #161618', fontFamily: 'system-ui, -apple-system, sans-serif' }">

    <!-- Header -->
    <div :style="{ padding: '16px 20px', borderBottom: '1px solid #161618' }">
      <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }">
        <h3 :style="{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#f0f0f0', textTransform: 'uppercase', margin: 0 }">&gt; | Linked Concepts</h3>
        <span :style="{ fontSize: '11px', fontWeight: 700, color: '#0891b2', backgroundColor: 'rgba(8,145,178,0.15)', padding: '2px 8px', borderRadius: '4px' }">{{ activeLinks?.length || 0 }} linked</span>
        <button
          v-if="activeCard"
          title="Ask AI about this card"
          :style="{ fontSize: '11px', fontWeight: 700, color: '#22d3ee', backgroundColor: 'transparent', border: '1px solid rgba(8,145,178,0.4)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', marginLeft: '8px' }"
          @click="openAsk"
        >✦ Ask AI</button>
      </div>
    </div>

    <div :style="{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }">

      <!-- SUGGESTIONS -->
      <div v-if="activeSuggestions && activeSuggestions.length > 0">
         <h4 :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }">Suggested</h4>
         <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px' }">
            <div v-for="s in activeSuggestions" :key="s.memonic.sid" :style="{ backgroundColor: '#0F0F12', border: '1px solid rgba(8,145,178,0.4)', borderRadius: '12px', padding: '16px', boxShadow: '0 0 15px rgba(8,145,178,0.1)' }">

               <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }">
                  <div :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
                    <span :style="{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: subjectOf(s.memonic.id)?.color || '#555' }" />
                    <span :style="{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: 600 }">{{ subjectOf(s.memonic.id)?.name || s.memonic.id }}</span>
                  </div>
                  <span :style="{ fontSize: '10px', color: '#0891b2', fontWeight: 700 }">score {{ s.score }}</span>
               </div>

               <div :style="{ fontSize: '14px', color: '#e8e8e8', fontWeight: 600, marginBottom: '16px', cursor: 'pointer' }" @click="select(s.memonic.sid)">
                  {{ s.memonic.title }}
               </div>

               <button
                  v-if="activeCard"
                  @click.prevent="link(activeCard.sid, s.memonic.sid, linkTitleFor(activeCard, s.memonic))"
                  :style="{ width: '100%', padding: '8px', backgroundColor: '#0891b2', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }"
                  onmouseover="this.style.backgroundColor='#22d3ee'; this.style.boxShadow='0 0 10px rgba(8,145,178,0.5)'"
                  onmouseout="this.style.backgroundColor='#0891b2'; this.style.boxShadow='none'"
                >Link</button>
            </div>
         </div>
      </div>

      <!-- ACTIVE LINKS -->
      <div v-if="activeLinks && activeLinks.length > 0">
         <h4 :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }">This Card's Links</h4>
         <div :style="{ display: 'flex', flexDirection: 'column', gap: '12px' }">
            <div
              v-for="l in activeLinks" :key="l.memonic?.sid ?? l.title"
              :style="{
                backgroundColor: '#121216',
                borderRadius: '12px',
                padding: '16px',
                border: l.cross ? '1px solid #0891b2' : '1px solid #222',
                boxShadow: l.cross ? '0 0 15px rgba(8,145,178,0.2)' : 'none'
              }"
            >
               <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }">
                  <span :style="{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }">{{ subjectOf(l.memonic?.id ?? "")?.name || l.memonic?.id || 'Unknown' }}</span>
                  <span v-if="l.cross" :style="{ fontSize: '9px', fontWeight: 700, color: '#22d3ee', backgroundColor: 'rgba(8,145,178,0.2)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em' }">CROSS-SUBJECT</span>
               </div>

               <div :style="{ fontSize: '14px', color: '#f0f0f0', fontWeight: 700, marginBottom: '16px', cursor: 'pointer' }" @click="l.memonic && select(l.memonic.sid)">
                  {{ l.memonic?.title || 'Linked Card' }}
               </div>

               <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }">
                  <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
                    <span :style="{ fontSize: '11px', color: '#666' }">via</span>
                    <span :style="{ fontSize: '11px', color: '#22d3ee', backgroundColor: 'rgba(8,145,178,0.1)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(8,145,178,0.3)' }">#{{ l.title || 'manual' }}</span>
                  </div>
                  <button v-if="activeCard && l.memonic" @click.prevent="unlink(activeCard.sid, l.memonic.sid)" :style="{ background: 'transparent', border: 'none', color: '#666', fontSize: '11px', cursor: 'pointer', padding: 0 }">unlink ✕</button>
               </div>
            </div>
         </div>
      </div>

      <p v-if="(!activeLinks || activeLinks.length === 0) && (!activeSuggestions || activeSuggestions.length === 0)" :style="{ fontSize: '12px', color: '#555', textAlign: 'center', padding: '24px 12px' }">
         No links yet. Add tags to connect this card to other concepts.
      </p>
    </div>
  </aside>
</template>
