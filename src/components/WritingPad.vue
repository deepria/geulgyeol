<script setup lang="ts">
import { computed, ref } from 'vue'
import { guidePaths, type PartSlot } from '../hangul'
import { WRITING_REFERENCE, strokePath, type Point, type Stroke } from '../font'
const props = defineProps<{ character: string; strokes: Stroke[]; thickness: number; part?: PartSlot }>()
const emit = defineEmits<{ commit: [stroke: Stroke] }>()
const current = ref<Stroke>([])
const activePointer = ref<number | null>(null)
const paths = computed(() => [...props.strokes, current.value].filter(stroke => stroke.length).map(stroke => strokePath(stroke, props.thickness)))
function point(event: PointerEvent): Point {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  return [Math.max(0, Math.min(500, (event.clientX - rect.left) / rect.width * 500)), Math.max(0, Math.min(500, (event.clientY - rect.top) / rect.height * 500)), event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5]
}
function start(event: PointerEvent) {
  if (activePointer.value !== null || event.button !== 0) return
  event.preventDefault()
  activePointer.value = event.pointerId
  ;(event.currentTarget as SVGElement).setPointerCapture(event.pointerId)
  current.value = [point(event)]
}
function move(event: PointerEvent) {
  if (activePointer.value !== event.pointerId || current.value.length >= 10_000) return
  event.preventDefault()
  const next = point(event), last = current.value.at(-1)!
  if (Math.hypot(next[0] - last[0], next[1] - last[1]) > 0.6) current.value.push(next)
}
function finish(event: PointerEvent) {
  if (activePointer.value !== event.pointerId) return
  if (current.value.length) emit('commit', current.value.map(p => [...p] as Point))
  current.value = []; activePointer.value = null
}
</script>

<template>
  <svg class="writing-pad" viewBox="0 0 500 500" role="img" :aria-label="`${character} 쓰기 영역. 마우스, 터치, 펜으로 그려주세요.`" @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish" @contextmenu.prevent>
    <defs><pattern id="paper-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="currentColor" opacity="0.12" /></pattern></defs>
    <rect width="500" height="500" fill="url(#paper-dots)" />
    <rect x="65" y="65" width="370" height="370" rx="2" class="guide-box" />
    <path d="M250 65V435M65 250H435" class="guide-line" />
    <g v-if="part" class="part-guide" aria-hidden="true"><rect :x="part.box.x - 12" :y="part.box.y - 12" :width="part.box.width + 24" :height="part.box.height + 24" rx="8" class="part-target" /><path v-for="(path, index) in guidePaths(part)" :key="index" :d="path" class="part-reference" /></g>
    <text v-if="!part && !strokes.length && !current.length" :x="WRITING_REFERENCE.centerX" :y="WRITING_REFERENCE.baseline" :font-size="WRITING_REFERENCE.fontSize" text-anchor="middle" class="ghost-character">{{ character }}</text>
    <g class="ink"><path v-for="(path, index) in paths" :key="index" :d="path" /></g>
    <path :d="`M65 ${WRITING_REFERENCE.baseline}H435`" class="baseline" />
  </svg>
</template>
