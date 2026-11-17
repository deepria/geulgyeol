<script setup lang="ts">
import { computed } from 'vue'
import { BRUSHES, BRUSH_SAMPLE, type BrushId } from '../brushes'
import { strokePath } from '../font'
const props = defineProps<{ modelValue: BrushId; canApply: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [brush: BrushId]; apply: [] }>()
const samples = computed(() => BRUSHES.map(brush => ({ ...brush, path: strokePath({ points: BRUSH_SAMPLE, brush: brush.id }, 8) })))
function keydown(event: KeyboardEvent, index: number) {
  const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (!offset && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault(); event.stopPropagation()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? BRUSHES.length - 1 : (index + offset + BRUSHES.length) % BRUSHES.length
  emit('update:modelValue', BRUSHES[next]!.id)
  ;((event.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement)?.focus()
}
</script>

<template>
  <div class="brush-picker">
    <div class="brush-picker-heading"><span>도구 고르기</span><button v-if="canApply" class="apply-brush" @click="emit('apply')">현재 글자의 획에 적용 ↗</button></div>
    <div class="brush-options" role="radiogroup" aria-label="펜과 브러시 선택">
      <button v-for="(brush,index) in samples" :key="brush.id" role="radio" :aria-checked="modelValue === brush.id" :tabindex="modelValue === brush.id ? 0 : -1" :aria-label="brush.name" :title="brush.description" @click="emit('update:modelValue',brush.id)" @keydown="keydown($event,index)">
        <svg viewBox="0 0 120 42" aria-hidden="true"><path :d="brush.path" /></svg><span>{{ brush.name }}</span>
      </button>
    </div>
    <p class="brush-hint">{{ BRUSHES.find(brush => brush.id === modelValue)!.description }} · 새로 쓰는 획부터 적용돼요.</p>
  </div>
</template>
