<script setup lang="ts">
// Obsidian-style physical graph of the WHOLE vault. Nodes = cards (subject
// colors, radius grows with link degree), edges = links. Hand-rolled force
// simulation — repulsion + edge springs + center gravity — no dependencies.
// Click = select card · Ctrl+click = bulk-select · drag node = move it ·
// drag background = pan · wheel = zoom. Controls panel top-right.

// ========== 1. IMPORTS ==========
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useLibrary } from "@/composables/library";

// ========== 2. TYPES ==========
/** A physics node — position persists across data refreshes (keyed by sid). */
interface Node {
  sid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** One drawn edge between two existing nodes. */
interface Edge {
  a: number;
  b: number;
  t: string;
}

/** A pointer position in world (graph) coordinates. */
interface WorldPoint {
  x: number;
  y: number;
}

// ========== 3. CONSTANTS ==========
// (none)

// ========== 4. STATE ==========
const { memonics, subjects, activeSid, select, selectedSids, toggleSelected } = useLibrary();

const wrapEl = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

// customization
const panelOpen = ref(true);
const showLabels = ref(true);
const showEdgeLabels = ref(false);
const running = ref(true);
const repulsion = ref(1400);
const linkDist = ref(120);

// Node positions persist across data refreshes (map by sid).
const nodes = new Map<number, Node>();
let edges: Edge[] = [];
const view = { x: 0, y: 0, k: 1 };
let ctx: CanvasRenderingContext2D | null = null;
let W = 0, H = 0, dpr = 1, raf = 0;
let dragging: Node | null = null;
let panning: { sx: number; sy: number; ox: number; oy: number } | null = null;
let downAt: { x: number; y: number } | null = null;
let ro: ResizeObserver | null = null;

// ========== 5. LOGIC ==========

// ----- colorOf -----
// purpose:   the subject color for a subject id
// io:        in → id (string) | out → string (hex)
// processes: none                                                        [auto]
function colorOf(id: string): string {
  return subjects.value.find((s) => s.id === id)?.color ?? "#22d3ee";
}

// ----- syncData -----
// purpose:   reconcile nodes/edges with the mirror — new cards get ring positions, dead cards vanish
// io:        in → none | out → none
// processes: none                                                        [auto]
function syncData(): void {
  // 1. add missing nodes on a deterministic ring, remember live sids
  const seen = new Set<number>();
  const N = memonics.value.length || 1;
  memonics.value.forEach((m, i) => {
    seen.add(m.sid);
    if (!nodes.has(m.sid)) {
      const a = (i / N) * Math.PI * 2;
      const r = 60 + (i % 7) * 30;
      nodes.set(m.sid, { sid: m.sid, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 });
    }
  });
  // 2. drop nodes for deleted cards
  for (const sid of [...nodes.keys()]) if (!seen.has(sid)) nodes.delete(sid);
  // 3. rebuild edges (only those whose target exists)
  edges = [];
  for (const m of memonics.value)
    for (const l of m.links)
      if (nodes.has(l.targetSID)) edges.push({ a: m.sid, b: l.targetSID, t: l.title });
}
watch(memonics, syncData, { immediate: true });

// ----- degreeOf -----
// purpose:   how many edges touch a node
// io:        in → sid (number) | out → number
// processes: none                                                        [auto]
function degreeOf(sid: number): number {
  let n = 0;
  for (const e of edges) if (e.a === sid || e.b === sid) n++;
  return n;
}

// ----- radiusOf -----
// purpose:   node visual radius — grows with degree, capped
// io:        in → sid (number) | out → number (px)
// processes: degreeOf                                                     [auto]
function radiusOf(sid: number): number {
  return 5 + Math.min(degreeOf(sid) * 1.5, 9);
}

// ----- rescatter -----
// purpose:   throw every node onto a fresh random ring and stop their motion
// io:        in → none | out → none
// processes: none                                                        [auto]
function rescatter(): void {
  const N = nodes.size || 1;
  let i = 0;
  for (const n of nodes.values()) {
    const a = (i++ / N) * Math.PI * 2;
    const r = 60 + Math.random() * 180;
    n.x = Math.cos(a) * r;
    n.y = Math.sin(a) * r;
    n.vx = 0;
    n.vy = 0;
  }
}

// ----- step -----
// purpose:   one physics tick — pairwise repulsion, edge springs, center gravity, damping, integration
// io:        in → none | out → none
// processes: none                                                        [auto]
function step(): void {
  // 1. repulsion: every pair pushes apart with k/d²
  const ns = [...nodes.values()];
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const A = ns[i]!, B = ns[j]!;
      let dx = B.x - A.x, dy = B.y - A.y;
      const d2 = dx * dx + dy * dy || 1;
      const d = Math.sqrt(d2);
      const f = repulsion.value / d2;
      dx /= d;
      dy /= d;
      A.vx -= dx * f;
      A.vy -= dy * f;
      B.vx += dx * f;
      B.vy += dy * f;
    }
  }
  // 2. springs: each edge pulls its ends toward the target distance
  for (const e of edges) {
    const A = nodes.get(e.a)!, B = nodes.get(e.b)!;
    let dx = B.x - A.x, dy = B.y - A.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - linkDist.value) * 0.02;
    dx /= d;
    dy /= d;
    A.vx += dx * f;
    A.vy += dy * f;
    B.vx -= dx * f;
    B.vy -= dy * f;
  }
  // 3. gravity + damping + integration (a dragged node is pinned)
  for (const n of ns) {
    n.vx -= n.x * 0.004;
    n.vy -= n.y * 0.004;
    n.vx *= 0.85;
    n.vy *= 0.85;
    if (dragging?.sid !== n.sid) {
      n.x += n.vx;
      n.y += n.vy;
    }
  }
}

// ----- draw -----
// purpose:   render edges (with optional titles), nodes (with selection/active rings), and labels
// io:        in → none | out → none
// processes: radiusOf, colorOf                                            [auto]
function draw(): void {
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#09090B";
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + view.x, H / 2 + view.y);
  ctx.scale(view.k, view.k);

  // 1. edges
  ctx.strokeStyle = "rgba(130,140,150,0.35)";
  ctx.lineWidth = 1 / view.k;
  for (const e of edges) {
    const A = nodes.get(e.a), B = nodes.get(e.b);
    if (!A || !B) continue;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  if (showEdgeLabels.value) {
    ctx.fillStyle = "rgba(34,211,238,0.75)";
    ctx.font = `${10 / view.k}px JetBrains Mono, monospace`;
    ctx.textAlign = "center";
    for (const e of edges) {
      const A = nodes.get(e.a), B = nodes.get(e.b);
      if (!A || !B) continue;
      ctx.fillText("#" + e.t, (A.x + B.x) / 2, (A.y + B.y) / 2 - 4 / view.k);
    }
  }

  // 2. nodes (subject colors; rings for active + bulk-selected)
  for (const m of memonics.value) {
    const n = nodes.get(m.sid);
    if (!n) continue;
    const r = radiusOf(m.sid);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colorOf(m.id);
    ctx.fill();
    if (m.sid === activeSid.value) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 4 / view.k, 0, Math.PI * 2);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2 / view.k;
      ctx.stroke();
    }
    if (selectedSids.value.includes(m.sid)) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 8 / view.k, 0, Math.PI * 2);
      ctx.setLineDash([4 / view.k, 3 / view.k]);
      ctx.strokeStyle = "rgba(34,211,238,0.7)";
      ctx.lineWidth = 1.5 / view.k;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // 3. labels
  if (showLabels.value) {
    ctx.fillStyle = "#C8C8C8";
    ctx.font = `${11 / view.k}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (const m of memonics.value) {
      const n = nodes.get(m.sid);
      if (n) ctx.fillText(m.title.length > 28 ? m.title.slice(0, 27) + "…" : m.title, n.x, n.y + radiusOf(m.sid) + 14 / view.k);
    }
  }
}

// ----- loop -----
// purpose:   the animation frame loop — step physics (when running) then draw
// io:        in → none | out → none
// processes: step, draw                                                    [auto]
function loop(): void {
  if (running.value) step();
  draw();
  raf = requestAnimationFrame(loop);
}

// ----- resize -----
// purpose:   match the canvas bitmap to its wrapper's CSS size (HiDPI aware)
// io:        in → none | out → none
// processes: none                                                         [auto]
function resize(): void {
  if (!wrapEl.value || !canvasEl.value) return;
  W = wrapEl.value.clientWidth;
  H = wrapEl.value.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvasEl.value.width = W * dpr;
  canvasEl.value.height = H * dpr;
  canvasEl.value.style.width = W + "px";
  canvasEl.value.style.height = H + "px";
}

// ----- toWorld -----
// purpose:   convert a pointer event to world (graph) coordinates
// io:        in → e (MouseEvent) | out → WorldPoint
// processes: none                                                         [auto]
function toWorld(e: MouseEvent): WorldPoint {
  const rect = canvasEl.value!.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - W / 2 - view.x) / view.k,
    y: (e.clientY - rect.top - H / 2 - view.y) / view.k,
  };
}

// ----- nodeAt -----
// purpose:   hit-test which node (if any) is under a world point (topmost first)
// io:        in → p (WorldPoint) | out → Node | null
// processes: radiusOf                                                     [auto]
function nodeAt(p: WorldPoint): Node | null {
  for (const m of [...memonics.value].reverse()) {
    const n = nodes.get(m.sid);
    if (!n) continue;
    const r = radiusOf(m.sid) + 4 / view.k;
    if ((p.x - n.x) ** 2 + (p.y - n.y) ** 2 <= r * r) return n;
  }
  return null;
}

// ----- onDown -----
// purpose:   press = grab a node (drag) or the background (pan); remembers the spot for click-vs-drag
// io:        in → e (MouseEvent) | out → none
// processes: toWorld, nodeAt                                              [auto]
function onDown(e: MouseEvent): void {
  const p = toWorld(e);
  downAt = { x: e.clientX, y: e.clientY };
  const n = nodeAt(p);
  if (n) dragging = n;
  else panning = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
}

// ----- onMove -----
// purpose:   move the dragged node to the pointer (world coords) or pan the view
// io:        in → e (MouseEvent) | out → none
// processes: toWorld                                                      [auto]
function onMove(e: MouseEvent): void {
  if (dragging) {
    const p = toWorld(e);
    dragging.x = p.x;
    dragging.y = p.y;
    dragging.vx = 0;
    dragging.vy = 0;
  } else if (panning) {
    view.x = panning.ox + (e.clientX - panning.sx);
    view.y = panning.oy + (e.clientY - panning.sy);
  }
}

// ----- onUp -----
// purpose:   release — a press that barely moved is a click (select / bulk-select)
// io:        in → e (MouseEvent) | out → none
// processes: toggleSelected, select                                       [auto]
function onUp(e: MouseEvent): void {
  // 1. click vs drag: did the pointer move more than a few px?
  const moved = downAt && Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 4;
  // 2. a click on a node selects it (Ctrl/Cmd = bulk)
  if (dragging && !moved) {
    if (e.ctrlKey || e.metaKey) toggleSelected(dragging.sid);
    else select(dragging.sid);
  }
  dragging = null;
  panning = null;
  downAt = null;
}

// ----- onWheel -----
// purpose:   zoom the view multiplicatively, clamped
// io:        in → e (WheelEvent) | out → none
// processes: none                                                         [auto]
function onWheel(e: WheelEvent): void {
  view.k = Math.min(3, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
}

onMounted(() => {
  ctx = canvasEl.value?.getContext("2d") ?? null;
  resize();
  ro = new ResizeObserver(resize);
  if (wrapEl.value) ro.observe(wrapEl.value);
  loop();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
});
</script>

<template>
  <div ref="wrapEl" :style="{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#09090B' }">
    <canvas
      ref="canvasEl"
      :style="{ position: 'absolute', inset: 0, display: 'block', cursor: dragging ? 'grabbing' : 'grab' }"
      @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp" @wheel.prevent="onWheel"
    />

    <!-- customization panel -->
    <div :style="{ position: 'absolute', top: '14px', right: '14px', width: '210px', backgroundColor: 'rgba(15,15,18,0.92)', border: '1px solid #222', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'system-ui, sans-serif' }">
      <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }" @click="panelOpen = !panelOpen">
        <span :style="{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase' }">◉ Graph</span>
        <span :style="{ fontSize: '10px', color: '#22d3ee' }">{{ panelOpen ? 'hide' : 'show' }}</span>
      </div>
      <template v-if="panelOpen">
        <label :style="{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#C8C8C8', cursor: 'pointer' }">
          <input type="checkbox" v-model="showLabels" /> Card titles
        </label>
        <label :style="{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#C8C8C8', cursor: 'pointer' }">
          <input type="checkbox" v-model="showEdgeLabels" /> Link titles
        </label>
        <label :style="{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#C8C8C8', cursor: 'pointer' }">
          <input type="checkbox" v-model="running" /> Physics
        </label>
        <label :style="{ fontSize: '11px', color: '#8a8a90' }">Repulsion
          <input type="range" min="200" max="4000" step="100" v-model.number="repulsion" :style="{ width: '100%', accentColor: '#22d3ee' }" />
        </label>
        <label :style="{ fontSize: '11px', color: '#8a8a90' }">Link distance
          <input type="range" min="40" max="300" step="10" v-model.number="linkDist" :style="{ width: '100%', accentColor: '#22d3ee' }" />
        </label>
        <button @click="rescatter" :style="{ fontSize: '11px', fontWeight: 700, color: '#9A9AA2', backgroundColor: 'transparent', border: '1px solid #2C2C2C', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer' }">↺ Re-scatter</button>
        <div :style="{ fontSize: '10px', color: '#555', lineHeight: 1.5 }">click = open · ctrl+click = select<br />drag node/background · wheel = zoom</div>
      </template>
    </div>
  </div>
</template>
