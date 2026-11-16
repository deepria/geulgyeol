<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WritingPad from './components/WritingPad.vue'
import { STARTER, DEFAULT_SETTINGS, download, hasInk, parseProject, previewTransform, strokePath, uniqueCharacters, type Glyphs, type Project, type Stroke } from './font'

import { PART_SLOTS, SLOT_BY_ID, QUICK_START, VARIANT_LABELS, availableCharacters, glyphSource, resolvedStrokes, type Components, type PartKind } from './hangul'

const STORAGE_KEY = 'geulgyeol.project.v2'
const LEGACY_STORAGE_KEY = 'geulgyeol.project.v1'
const glyphs = ref<Glyphs>({})
const components = ref<Components>({})
const mode = ref<'direct' | 'compose'>('direct')
const selectedPartId = ref(QUICK_START[0]!)
const quickStart = ref(true)
const exportProgress = ref({ completed: 0, total: 0 })
let exportWorker: Worker | undefined
let rejectExport: ((reason: Error) => void) | undefined
const currentPart = computed(() => SLOT_BY_ID[selectedPartId.value]!)
const visibleParts = computed(() => PART_SLOTS.filter(slot => slot.kind === currentPart.value.kind && slot.variant === currentPart.value.variant))
const completedParts = computed(() => PART_SLOTS.filter(slot => hasInk(components.value[slot.id])).length)
const quickCompleted = computed(() => QUICK_START.filter(id => hasInk(components.value[id])).length)
const partPosition = computed(() => (quickStart.value ? QUICK_START : PART_SLOTS.map(slot => slot.id)).indexOf(selectedPartId.value) + 1)
const available = computed(() => availableCharacters(glyphs.value, components.value))
const composedCount = computed(() => available.value.length - allWritten.value.length)
const characters = ref(uniqueCharacters(STARTER))
const settings = ref({ ...DEFAULT_SETTINGS })
const preview = ref('안녕하세요\n나만의 손글씨로\n오늘을 기록해요.')
const name = ref('My Geulgyeol')
const currentIndex = ref(0)
const modal = ref<'adjust' | 'export' | 'characters' | null>(null)
const customText = ref('')
const toast = ref('')
const saveState = ref('이 기기에 자동 저장')
const busy = ref(false)
const importer = ref<HTMLInputElement | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const current = computed(() => mode.value === 'compose' ? currentPart.value.char : characters.value[currentIndex.value] ?? '안')
const strokes = computed(() => mode.value === 'compose' ? components.value[selectedPartId.value] ?? [] : glyphs.value[current.value] ?? [])
const written = computed(() => characters.value.filter(char => hasInk(glyphs.value[char])).length)
const allWritten = computed(() => Object.keys(glyphs.value).filter(char => hasInk(glyphs.value[char])))
const previewLetters = computed(() => [...preview.value.normalize('NFC')])
const missing = computed(() => uniqueCharacters(preview.value).filter(char => glyphSource(char, glyphs.value, components.value) === 'missing'))
const progress = computed(() => Math.round(written.value / characters.value.length * 100))
const project = (): Project => ({ version: 2, glyphs: glyphs.value, components: components.value, mode: mode.value, characters: characters.value, settings: settings.value, preview: preview.value, name: name.value })
let saveTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(message: string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 5000) }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project())); saveState.value = '이 기기에 저장됨' }
  catch { saveState.value = '자동 저장 불가 · 작업 파일을 저장해주세요' }
}
function apply(data: Project) {
  glyphs.value = data.glyphs; components.value = data.components; mode.value = data.mode; characters.value = data.characters.length ? data.characters : uniqueCharacters(STARTER)
  quickStart.value = QUICK_START.some(id => !hasInk(data.components[id]))
  const order = quickStart.value ? QUICK_START : PART_SLOTS.map(slot => slot.id)
  selectedPartId.value = order.find(id => !hasInk(data.components[id])) ?? order[0]!
  settings.value = data.settings; preview.value = data.preview; name.value = data.name; currentIndex.value = 0
}
onMounted(() => {
  try { const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY); if (saved) apply(parseProject(saved)) }
  catch { notify('저장된 작업을 읽지 못했어요. 작업 파일이 있다면 불러와주세요.') }
  window.addEventListener('keydown', keyboard)
  window.addEventListener('pagehide', persist)
})
watch([glyphs, components, mode, characters, settings, preview, name], () => { saveState.value = '저장 중…'; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400) }, { deep: true })
watch(modal, value => { if (value) { if (!dialog.value?.open) dialog.value?.showModal() } else dialog.value?.close() })
onBeforeUnmount(() => { cancelExport(); clearTimeout(saveTimer); clearTimeout(toastTimer); persist(); window.removeEventListener('keydown', keyboard); window.removeEventListener('pagehide', persist) })
function setStrokes(value: Stroke[]) {
  if (mode.value === 'compose') components.value[selectedPartId.value] = value
  else glyphs.value[current.value] = value
}
function commit(stroke: Stroke) {
  if (strokes.value.length >= 200) { notify('한 글자에 최대 200획까지 쓸 수 있어요.'); return }
  setStrokes([...strokes.value, stroke])
}
function undo() { if (strokes.value.length) setStrokes(strokes.value.slice(0, -1)) }
function clear() { if (strokes.value.length && confirm(`‘${current.value}’에 쓴 획을 모두 지울까요?`)) setStrokes([]) }
function next() {
  if (mode.value === 'direct') { currentIndex.value = (currentIndex.value + 1) % characters.value.length; return }
  const order = quickStart.value ? QUICK_START : PART_SLOTS.map(slot => slot.id)
  const index = order.indexOf(selectedPartId.value)
  if (quickStart.value && index === order.length - 1) {
    quickStart.value = false
    selectedPartId.value = PART_SLOTS.find(slot => !hasInk(components.value[slot.id]))?.id ?? PART_SLOTS[0]!.id
  } else selectedPartId.value = order[(index + 1) % order.length]!
}
function switchTab() { mode.value = mode.value === 'direct' ? 'compose' : 'direct'; document.getElementById(mode.value === 'direct' ? 'direct-tab' : 'compose-tab')?.focus() }
function startQuick() { mode.value = 'compose'; quickStart.value = true; selectedPartId.value = QUICK_START.find(id => !hasInk(components.value[id])) ?? QUICK_START[0]!; preview.value = '가 각\n나만의 글자 조합' }
function changeKind(kind: PartKind) { quickStart.value = false; selectedPartId.value = PART_SLOTS.find(slot => slot.kind === kind && !hasInk(components.value[slot.id]))?.id ?? PART_SLOTS.find(slot => slot.kind === kind)!.id }
function changeVariant(event: Event) { quickStart.value = false; selectedPartId.value = PART_SLOTS.find(slot => slot.kind === currentPart.value.kind && slot.variant === Number((event.target as HTMLSelectElement).value))!.id }
function previous() {
  if (mode.value === 'direct') currentIndex.value = Math.max(0, currentIndex.value - 1)
  else { const order = quickStart.value ? QUICK_START : PART_SLOTS.map(slot => slot.id); selectedPartId.value = order[Math.max(0, order.indexOf(selectedPartId.value) - 1)]! }
}
function keyboard(event: KeyboardEvent) {
  if (modal.value || (event.target instanceof HTMLElement && (event.target.closest('[role=tablist]') || event.target.matches('input,textarea,select') || event.target.isContentEditable))) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo() }
  if (event.key === 'ArrowRight') { event.preventDefault(); next() }
  if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
}
function addCharacters(text: string) {
  const newChars = uniqueCharacters(text)
  const combined = [...new Set([...characters.value, ...newChars])]
  if (!newChars.length) { notify('추가할 글자나 문장을 입력해주세요.'); return }
  if (combined.length > 200) { notify('한 작업에 최대 200글자까지 추가할 수 있어요.'); return }
  const firstMissing = newChars.find(char => !hasInk(glyphs.value[char]))
  mode.value = 'direct'
  characters.value = combined
  if (firstMissing) currentIndex.value = combined.indexOf(firstMissing)
  modal.value = null; customText.value = ''
  notify('글자 목록에 추가했어요. 같은 글자는 한 번만 쓰면 돼요.')
}
function saveProject() { persist(); download(JSON.stringify(project()), 'geulgyeol-work.json', 'application/json'); notify('다시 편집할 수 있는 작업 파일을 저장했어요.') }
async function importProject(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    if (file.size > 24_000_000) throw new Error('작업 파일은 24MB 이하로 불러올 수 있어요.')
    const loaded = parseProject(await file.text())
    if ((allWritten.value.length || completedParts.value) && !confirm('현재 작업을 불러온 파일로 바꿀까요? 보관하려면 취소 후 작업 저장을 눌러주세요.')) return
    apply(loaded); persist(); notify('작업을 불러왔어요.')
  } catch (error) { notify(error instanceof SyntaxError ? '올바른 JSON 작업 파일이 아니에요.' : (error as Error).message) }
}
function cancelExport() {
  exportWorker?.terminate(); exportWorker = undefined
  rejectExport?.(new DOMException('Cancelled', 'AbortError')); rejectExport = undefined
}
function closeModal() { if (busy.value) cancelExport(); modal.value = null }
async function exportFont() {
  if (busy.value) return
  busy.value = true
  exportProgress.value = { completed: 0, total: available.value.length }
  const count = available.value.length
  try {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      rejectExport = reject
      const worker = new Worker(new URL('./font.worker.ts', import.meta.url), { type: 'module' })
      exportWorker = worker
      worker.onmessage = event => {
        if (event.data.type === 'progress') exportProgress.value = { completed: event.data.completed, total: event.data.total }
        else if (event.data.type === 'done') resolve(event.data.buffer)
        else reject(new Error('Font export failed'))
      }
      worker.onerror = () => reject(new Error('Font export failed'))
      worker.postMessage(JSON.parse(JSON.stringify({ glyphs: glyphs.value, components: components.value, settings: settings.value, name: name.value })))
    })
    const filename = name.value.trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '-') || 'My-Geulgyeol'
    download(buffer, `${filename}.otf`, 'font/otf')
    notify(`${count.toLocaleString()}글자가 담긴 OTF 파일을 다운로드했어요.`)
    modal.value = null
  } catch (error) { if ((error as Error).name !== 'AbortError') notify('글꼴을 만들지 못했어요. 작업을 저장한 뒤 다시 시도해주세요.') }
  finally { exportWorker?.terminate(); exportWorker = undefined; rejectExport = undefined; busy.value = false }
}
const previewGlyphs = computed(() => Object.fromEntries(uniqueCharacters(preview.value).map(char => [char, {
  source: glyphSource(char, glyphs.value, components.value),
  paths: resolvedStrokes(char, glyphs.value, components.value).map(stroke => strokePath(stroke, settings.value.thickness)),
}])))
const nearbySamples = computed(() => [...new Set(['가', '각', currentPart.value.example])].map(char => ({
  char, source: glyphSource(char, glyphs.value, components.value),
  paths: resolvedStrokes(char, glyphs.value, components.value).map(stroke => strokePath(stroke, settings.value.thickness)),
})))
const previewPaths = (char: string) => previewGlyphs.value[char]?.paths ?? []

</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="/" aria-label="글결 홈"><span class="brand-mark">ㄱ<span>·</span></span>글결<span class="brand-tag">나만의 한글 손글꼴</span></a>
      <nav aria-label="작업 메뉴">
        <button class="text-button import-button" @click="importer?.click()">불러오기</button>
        <button class="text-button save-button" @click="saveProject">작업 저장 <span aria-hidden="true">↓</span></button>
        <button class="export-button" @click="modal = 'export'">글꼴 내보내기 <span aria-hidden="true">↗</span></button>
      </nav>
      <input ref="importer" type="file" accept=".json,application/json" class="sr-only" aria-label="글결 작업 파일 불러오기" @change="importProject" />
    </header>

    <main class="studio">
      <section class="preview-panel" aria-labelledby="preview-heading">
        <div class="section-label"><span class="small-star" aria-hidden="true">✳</span> YOUR WORDS, YOUR WAY <span class="edition">한글 에디션 01</span></div>
        <div class="preview-intro"><p class="kicker">당신의 글씨에는, 당신이 있으니까.</p><h1 id="preview-heading">쓰는 대로,<br />나의 글꼴.</h1><p class="intro-copy">반듯하지 않아도 괜찮아요.<br />한 글자씩, 세상에 하나뿐인 글꼴을 만들어보세요.</p></div>
        <div class="live-preview">
          <div class="preview-topline"><span><i></i> 내 손글씨 미리보기</span><button @click="modal = 'adjust'">글꼴 조절 <span aria-hidden="true">↗</span></button></div>
          <div class="handwriting-preview" role="img" :aria-label="`손글씨 미리보기: ${preview}`" :style="{ '--letter-spacing': `${settings.spacing / 1000}em` }">
            <template v-for="(char, index) in previewLetters" :key="index">
              <br v-if="char === '\n'" />
              <span v-else-if="/\s/.test(char)" class="preview-space">&nbsp;</span>
              <svg v-else-if="previewPaths(char).length" :data-source="previewGlyphs[char]?.source" :class="{ 'composed-glyph': previewGlyphs[char]?.source === 'composed' }" viewBox="0 0 500 500" class="preview-glyph" aria-hidden="true"><g :transform="previewTransform(settings.scale)"><path v-for="(path, pathIndex) in previewPaths(char)" :key="pathIndex" :d="path" /></g></svg>
              <span v-else class="fallback-glyph" aria-hidden="true">{{ char }}</span>
            </template>
          </div>
          <label class="preview-input-label" for="preview-input">어떤 문장으로 볼까요?</label>
          <textarea id="preview-input" v-model="preview" maxlength="500" rows="3" spellcheck="false" aria-label="미리보기 문장" />
          <div class="preview-note preview-legend"><span><i class="legend-direct"></i>직접 쓴 글자</span><span><i class="legend-composed"></i>자소 조합</span><span><i class="legend-dot"></i>아직 준비 안 됨</span></div>
          <p class="coverage-note">내보낼 수 있는 글자 <strong>{{ available.length.toLocaleString() }}</strong>개 · 직접 쓴 글자를 먼저 사용해요.</p>
          <button v-if="missing.length" class="add-missing" @click="addCharacters(preview)">미리보기의 안 쓴 글자 {{ missing.length }}개 추가 <span aria-hidden="true">+</span></button>
        <button v-if="composedCount" class="add-missing refine-button" @click="addCharacters(preview)">문장의 글자 직접 보완 ↗</button></div>
        <div class="preview-footer"><span>내 손끝에서 시작되는 작은 창작.</span><span class="footer-flower" aria-hidden="true">✳</span></div>
      </section>

      <section class="writing-panel" :class="{ 'composition-mode': mode === 'compose' }" aria-labelledby="writing-heading">
        <div class="writing-topline"><span class="section-index">{{ mode === 'compose' ? '02 — 자소 조합' : '01 — 글자 쓰기' }}</span><span class="save-state"><i></i>{{ saveState }}</span></div>
        <div class="mode-tabs" role="tablist" aria-label="글꼴 제작 방식" @keydown.right.prevent="switchTab" @keydown.left.prevent="switchTab">
          <button id="direct-tab" role="tab" :aria-selected="mode === 'direct'" aria-controls="writing-workspace" :tabindex="mode === 'direct' ? 0 : -1" @click="mode = 'direct'">직접 쓰기 <span>한 글자씩</span></button>
          <button id="compose-tab" role="tab" :aria-selected="mode === 'compose'" aria-controls="writing-workspace" :tabindex="mode === 'compose' ? 0 : -1" @click="mode = 'compose'">자소 조합 <span>172개로 한글 전체</span></button>
        </div>
        <p class="mode-explanation">두 탭의 작업이 함께 적용돼요. 직접 쓴 글자가 있으면 그 모양을 먼저 써요.</p>
        <div id="writing-workspace" role="tabpanel" :aria-labelledby="mode === 'direct' ? 'direct-tab' : 'compose-tab'">
        <div v-if="mode === 'compose'" class="composition-controls">
          <div class="composition-start"><div><strong>작은 자소를 모아, 11,172자까지.</strong><p>필요한 자소가 모두 준비된 글자부터 조합돼요.</p></div><button @click="startQuick">가·각 빠른 시작 ↗</button></div>
          <div v-if="quickStart" class="quick-route"><span>빠른 시작 {{ quickCompleted }} / 5</span><div><button v-for="(id, index) in QUICK_START" :key="id" :class="{ active: id === selectedPartId, done: hasInk(components[id]) }" :aria-label="`빠른 시작 ${index + 1}: ${SLOT_BY_ID[id]!.char}`" @click="selectedPartId = id">{{ index + 1 }} {{ SLOT_BY_ID[id]!.char }}</button></div><p>1·2번을 쓰면 ‘가’, 3·4·5번까지 쓰면 ‘각’도 만들어져요.</p></div>
          <div class="part-kinds" aria-label="자소 종류"><button v-for="kind in (['initial', 'vowel', 'final'] as PartKind[])" :key="kind" :aria-pressed="currentPart.kind === kind" @click="changeKind(kind)">{{ { initial: '초성', vowel: '중성', final: '받침' }[kind] }} <span>{{ PART_SLOTS.filter(slot => slot.kind === kind && hasInk(components[slot.id])).length }}/{{ PART_SLOTS.filter(slot => slot.kind === kind).length }}</span></button></div>
          <label class="variant-label">자소 형태<select aria-label="자소 형태" :value="currentPart.variant" @change="changeVariant"><option v-for="(label, index) in VARIANT_LABELS[currentPart.kind]" :key="index" :value="index">{{ label }}</option></select></label>
        </div>
        <div class="writing-heading"><div><p class="kicker">{{ mode === 'compose' ? `예: ${currentPart.example}의 ${{ initial: '초성', vowel: '중성', final: '받침' }[currentPart.kind]} · 표시된 칸에 자소만 쓰세요` : '서두르지 말고, 평소 글씨 그대로' }}</p><h2 id="writing-heading">‘{{ current }}’{{ mode === 'compose' ? ' 자소를' : /[가-힣]/.test(current) && (current.charCodeAt(0) - 0xac00) % 28 !== 0 ? '을' : '를' }} 써주세요<span class="heading-dot">.</span></h2></div><span class="character-position"><strong>{{ String(mode === 'compose' ? partPosition : currentIndex + 1).padStart(2, '0') }}</strong> / {{ mode === 'compose' ? quickStart ? 5 : 172 : characters.length }}</span></div>
        <div v-if="mode === 'compose'" class="nearby-samples" aria-label="바로 보는 조합 결과"><span>바로 보는<br />조합 결과</span><div v-for="sample in nearbySamples" :key="sample.char" :data-source="sample.source"><svg v-if="sample.paths.length" class="sample-glyph" viewBox="0 0 500 500" :aria-label="sample.char"><g :transform="previewTransform(settings.scale)"><path v-for="(path, index) in sample.paths" :key="index" :d="path" /></g></svg><span v-else class="sample-fallback">{{ sample.char }}</span><small>{{ { direct: '직접 쓴 글자', composed: '조합 완료', missing: '자소 준비 중' }[sample.source] }}</small></div></div>
        <div class="pad-frame"><WritingPad :key="mode === 'compose' ? selectedPartId : current" :part="mode === 'compose' ? currentPart : undefined" :character="current" :strokes="strokes" :thickness="settings.thickness" @commit="commit" /><span class="pad-caption">마우스 · 손가락 · 펜으로 자유롭게</span><span class="pad-corner" aria-hidden="true">↙</span></div>
        <div class="drawing-actions"><div><button :disabled="!strokes.length" @click="undo"><span aria-hidden="true">↶</span> 한 획 취소</button><button :disabled="!strokes.length" @click="clear">지우기</button></div><button class="next-button" @click="next">{{ mode === 'compose' ? quickStart && selectedPartId === QUICK_START[4] ? '전체 자소로' : '다음 자소' : currentIndex === characters.length - 1 ? '처음 글자로' : '다음 글자' }} <span aria-hidden="true">→</span></button></div>
        <div v-if="mode === 'direct'" class="letter-library"><div class="library-heading"><h3>나의 글자들 <span>{{ written }} / {{ characters.length }}</span></h3><button @click="modal = 'characters'">글자 추가 +</button></div><div class="progress-track" role="progressbar" :aria-valuenow="written" :aria-valuemax="characters.length" aria-label="작성한 글자 수"><span :style="{ width: `${progress}%` }"></span></div><div class="letter-grid"><button v-for="(char, index) in characters" :key="char" :class="{ selected: index === currentIndex, written: hasInk(glyphs[char]) }" :aria-label="`${char}${hasInk(glyphs[char]) ? ', 작성 완료' : ', 아직 안 씀'}`" :aria-pressed="index === currentIndex" @click="currentIndex = index">{{ char }}<i v-if="hasInk(glyphs[char])"></i></button></div></div>
        <div v-else class="letter-library part-library"><div class="library-heading"><h3>모은 자소 <span>{{ completedParts }} / 172</span></h3><span class="ready-count">조합 {{ composedCount.toLocaleString() }}자</span></div><div class="progress-track" role="progressbar" :aria-valuenow="completedParts" :aria-valuemax="172" aria-label="작성한 자소 수"><span :style="{ width: `${completedParts / 172 * 100}%` }"></span></div><div class="letter-grid"><button v-for="slot in visibleParts" :key="slot.id" :class="{ selected: slot.id === selectedPartId, written: hasInk(components[slot.id]) }" :aria-label="`${slot.char}, ${slot.description}${hasInk(components[slot.id]) ? ', 작성 완료' : ', 아직 안 씀'}`" :aria-pressed="slot.id === selectedPartId" @click="quickStart = false; selectedPartId = slot.id">{{ slot.char }}<i v-if="hasInk(components[slot.id])"></i></button></div><p class="part-help">{{ currentPart.description }}에 쓰이는 형태예요. 같은 자소도 위치에 따라 따로 준비해요.</p></div>
        </div>
        <p class="local-note"><span aria-hidden="true">◇</span> 글씨는 이 브라우저에만 저장돼요. 서버로 전송하지 않아요.</p>
      </section>
    </main>
    <footer class="app-footer"><span>글결 <span class="footer-divider">/</span> 글씨에 담긴 나다움</span><span>자소를 조합하고 손글씨로 다듬는 한글 글꼴 도구</span><button @click="saveProject">작업 파일로 안전하게 보관하기 ↗</button></footer>

    <dialog ref="dialog" class="modal" aria-labelledby="modal-title" @cancel="closeModal" @click="event => { if (event.target === dialog) closeModal() }">
      <div class="modal-inner"><button class="modal-close" aria-label="닫기" @click="closeModal">×</button>
        <template v-if="modal === 'adjust'"><p class="modal-kicker">MAKE IT YOURS</p><h2 id="modal-title">조금 더, 나답게.</h2><p class="modal-description">미리보기와 다운로드 글꼴에 함께 적용돼요.</p><label class="slider-label">획 굵기 <span>{{ settings.thickness }}</span><input v-model.number="settings.thickness" type="range" min="4" max="30" aria-label="획 굵기" /></label><label class="slider-label">글자 크기 <span>{{ Math.round(settings.scale * 100) }}%</span><input v-model.number="settings.scale" type="range" min="0.7" max="1.2" step="0.01" aria-label="글자 크기" /></label><label class="slider-label">글자 간격 <span>{{ settings.spacing }}</span><input v-model.number="settings.spacing" type="range" min="-50" max="150" step="5" aria-label="글자 간격" /></label><button class="secondary-button" @click="settings = { ...DEFAULT_SETTINGS }">기본값으로</button><button class="primary-button" @click="modal = null">이 느낌으로 할게요</button></template>
        <template v-else-if="modal === 'export'"><p class="modal-kicker">A FONT, ALL YOURS</p><h2 id="modal-title">내 글씨를 글꼴로.</h2><p class="modal-description">준비된 {{ available.length.toLocaleString() }}글자와 공백을 OTF 파일로 만들어요.</p><label class="field-label" for="font-name">글꼴 이름</label><input id="font-name" v-model="name" :disabled="busy" class="text-input" maxlength="40" placeholder="My Geulgyeol" /><div class="export-summary"><span>직접 쓴 글자 {{ allWritten.length }}개 · 자소 조합 {{ composedCount.toLocaleString() }}개</span><p>{{ available.slice(0, 80).join(' ') || '아직 준비된 글자가 없어요.' }}{{ available.length > 80 ? ' …' : '' }}</p></div><p class="export-caveat">직접 쓴 글자를 먼저 담고, 나머지는 준비된 자소로 조합해요. 자소가 부족한 글자는 포함하지 않아요. 172개 자소를 모두 쓰면 현대 한글 11,172자를 만들 수 있어요. 작업 파일도 함께 보관해주세요.</p><button class="primary-button" :disabled="!available.length || busy" @click="exportFont">{{ busy ? '글꼴을 만들고 있어요…' : 'OTF 글꼴 다운로드 ↓' }}</button><div v-if="busy" class="export-progress" role="status"><progress :value="exportProgress.completed" :max="exportProgress.total || 1"></progress><p>{{ exportProgress.completed === exportProgress.total ? '파일을 마무리하고 있어요…' : `${exportProgress.completed.toLocaleString()} / ${exportProgress.total.toLocaleString()}글자 만드는 중` }}</p><button @click="cancelExport">생성 취소</button></div><button class="secondary-button" @click="saveProject">편집용 작업 파일 저장</button></template>
        <template v-else-if="modal === 'characters'"><p class="modal-kicker">ONE LETTER AT A TIME</p><h2 id="modal-title">다음엔 뭘 써볼까요?</h2><p class="modal-description">단어나 문장을 넣으면 필요한 글자만 추가해요.<br />같은 글자는 한 번만. 한 작업에 최대 200글자.</p><div class="preset-buttons"><button @click="customText = '사랑해 고마워 행복한 생일 축하해 늘 함께하자'">마음을 전하는 말</button><button @click="customText = '월화수목금토일 년월일 0123456789!?.,:()-'">날짜와 숫자</button><button @click="customText = '가나다라마바사아자차카타파하'">가나다 기초</button></div><label class="field-label" for="custom-characters">쓰고 싶은 문장</label><textarea id="custom-characters" v-model="customText" maxlength="500" class="text-input" rows="4" placeholder="예: 너의 모든 순간을 응원해" /><button class="primary-button" @click="addCharacters(customText)">글자 추가하기 +</button></template>
      </div>
    </dialog>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
