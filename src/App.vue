<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WritingPad from './components/WritingPad.vue'
import { STARTER, DEFAULT_SETTINGS, createFont, download, hasInk, parseProject, previewTransform, strokePath, uniqueCharacters, type Glyphs, type Project, type Stroke } from './font'

const STORAGE_KEY = 'geulgyeol.project.v1'
const glyphs = ref<Glyphs>({})
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
const current = computed(() => characters.value[currentIndex.value] ?? '안')
const strokes = computed(() => glyphs.value[current.value] ?? [])
const written = computed(() => characters.value.filter(char => hasInk(glyphs.value[char])).length)
const allWritten = computed(() => Object.keys(glyphs.value).filter(char => hasInk(glyphs.value[char])))
const previewLetters = computed(() => [...preview.value.normalize('NFC')])
const missing = computed(() => uniqueCharacters(preview.value).filter(char => !hasInk(glyphs.value[char])))
const progress = computed(() => Math.round(written.value / characters.value.length * 100))
const project = (): Project => ({ version: 1, glyphs: glyphs.value, characters: characters.value, settings: settings.value, preview: preview.value, name: name.value })
let saveTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(message: string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 5000) }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project())); saveState.value = '이 기기에 저장됨' }
  catch { saveState.value = '자동 저장 불가 · 작업 파일을 저장해주세요' }
}
function apply(data: Project) {
  glyphs.value = data.glyphs; characters.value = data.characters.length ? data.characters : uniqueCharacters(STARTER)
  settings.value = data.settings; preview.value = data.preview; name.value = data.name; currentIndex.value = 0
}
onMounted(() => {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) apply(parseProject(saved)) }
  catch { notify('저장된 작업을 읽지 못했어요. 작업 파일이 있다면 불러와주세요.') }
  window.addEventListener('keydown', keyboard)
  window.addEventListener('pagehide', persist)
})
watch([glyphs, characters, settings, preview, name], () => { saveState.value = '저장 중…'; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400) }, { deep: true })
watch(modal, value => { if (value) { if (!dialog.value?.open) dialog.value?.showModal() } else dialog.value?.close() })
onBeforeUnmount(() => { clearTimeout(saveTimer); clearTimeout(toastTimer); persist(); window.removeEventListener('keydown', keyboard); window.removeEventListener('pagehide', persist) })
function commit(stroke: Stroke) {
  if (strokes.value.length >= 200) { notify('한 글자에 최대 200획까지 쓸 수 있어요.'); return }
  glyphs.value[current.value] = [...strokes.value, stroke]
}
function undo() { if (strokes.value.length) glyphs.value[current.value] = strokes.value.slice(0, -1) }
function clear() { if (strokes.value.length && confirm(`‘${current.value}’에 쓴 획을 모두 지울까요?`)) glyphs.value[current.value] = [] }
function next() { currentIndex.value = (currentIndex.value + 1) % characters.value.length }
function keyboard(event: KeyboardEvent) {
  if (modal.value || (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable))) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo() }
  if (event.key === 'ArrowRight') { event.preventDefault(); next() }
  if (event.key === 'ArrowLeft') { event.preventDefault(); currentIndex.value = Math.max(0, currentIndex.value - 1) }
}
function addCharacters(text: string) {
  const newChars = uniqueCharacters(text)
  const combined = [...new Set([...characters.value, ...newChars])]
  if (!newChars.length) { notify('추가할 글자나 문장을 입력해주세요.'); return }
  if (combined.length > 200) { notify('한 작업에 최대 200글자까지 추가할 수 있어요.'); return }
  const firstMissing = newChars.find(char => !hasInk(glyphs.value[char]))
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
    if (file.size > 12_000_000) throw new Error('작업 파일은 12MB 이하로 불러올 수 있어요.')
    const loaded = parseProject(await file.text())
    if (allWritten.value.length && !confirm('현재 작업을 불러온 파일로 바꿀까요? 보관하려면 취소 후 작업 저장을 눌러주세요.')) return
    apply(loaded); persist(); notify('작업을 불러왔어요.')
  } catch (error) { notify(error instanceof SyntaxError ? '올바른 JSON 작업 파일이 아니에요.' : (error as Error).message) }
}
async function exportFont() {
  if (busy.value) return
  busy.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 30))
    const buffer = await createFont(glyphs.value, settings.value, name.value)
    const filename = name.value.trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '-') || 'My-Geulgyeol'
    download(buffer, `${filename}.otf`, 'font/otf')
    notify(`${allWritten.value.length}글자가 담긴 OTF 파일을 다운로드했어요.`)
    modal.value = null
  } catch { notify('글꼴을 만들지 못했어요. 작업을 저장한 뒤 다시 시도해주세요.') }
  finally { busy.value = false }
}
const previewPaths = (char: string) => (glyphs.value[char] ?? []).map(stroke => strokePath(stroke, settings.value.thickness))
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
              <svg v-else-if="hasInk(glyphs[char])" viewBox="0 0 500 500" class="preview-glyph" aria-hidden="true"><g :transform="previewTransform(settings.scale)"><path v-for="(path, pathIndex) in previewPaths(char)" :key="pathIndex" :d="path" /></g></svg>
              <span v-else class="fallback-glyph" aria-hidden="true">{{ char }}</span>
            </template>
          </div>
          <label class="preview-input-label" for="preview-input">어떤 문장으로 볼까요?</label>
          <textarea id="preview-input" v-model="preview" maxlength="500" rows="3" spellcheck="false" aria-label="미리보기 문장" />
          <div class="preview-note"><span class="legend-dot"></span> 아직 쓰지 않은 글자는 연한 기본 글꼴로 보여요.</div>
          <button v-if="missing.length" class="add-missing" @click="addCharacters(preview)">미리보기의 안 쓴 글자 {{ missing.length }}개 추가 <span aria-hidden="true">+</span></button>
        </div>
        <div class="preview-footer"><span>내 손끝에서 시작되는 작은 창작.</span><span class="footer-flower" aria-hidden="true">✳</span></div>
      </section>

      <section class="writing-panel" aria-labelledby="writing-heading">
        <div class="writing-topline"><span class="section-index">01 — 글자 쓰기</span><span class="save-state"><i></i>{{ saveState }}</span></div>
        <div class="writing-heading"><div><p class="kicker">서두르지 말고, 평소 글씨 그대로</p><h2 id="writing-heading">‘{{ current }}’{{ /[가-힣]/.test(current) && (current.charCodeAt(0) - 0xac00) % 28 !== 0 ? '을' : '를' }} 써주세요<span class="heading-dot">.</span></h2></div><span class="character-position"><strong>{{ String(currentIndex + 1).padStart(2, '0') }}</strong> / {{ characters.length }}</span></div>
        <div class="pad-frame"><WritingPad :key="current" :character="current" :strokes="strokes" :thickness="settings.thickness" @commit="commit" /><span class="pad-caption">마우스 · 손가락 · 펜으로 자유롭게</span><span class="pad-corner" aria-hidden="true">↙</span></div>
        <div class="drawing-actions"><div><button :disabled="!strokes.length" @click="undo"><span aria-hidden="true">↶</span> 한 획 취소</button><button :disabled="!strokes.length" @click="clear">지우기</button></div><button class="next-button" @click="next">{{ currentIndex === characters.length - 1 ? '처음 글자로' : '다음 글자' }} <span aria-hidden="true">→</span></button></div>
        <div class="letter-library"><div class="library-heading"><h3>나의 글자들 <span>{{ written }} / {{ characters.length }}</span></h3><button @click="modal = 'characters'">글자 추가 +</button></div><div class="progress-track" role="progressbar" :aria-valuenow="written" :aria-valuemax="characters.length" aria-label="작성한 글자 수"><span :style="{ width: `${progress}%` }"></span></div><div class="letter-grid"><button v-for="(char, index) in characters" :key="char" :class="{ selected: index === currentIndex, written: hasInk(glyphs[char]) }" :aria-label="`${char}${hasInk(glyphs[char]) ? ', 작성 완료' : ', 아직 안 씀'}`" :aria-pressed="index === currentIndex" @click="currentIndex = index">{{ char }}<i v-if="hasInk(glyphs[char])"></i></button></div></div>
        <p class="local-note"><span aria-hidden="true">◇</span> 글씨는 이 브라우저에만 저장돼요. 서버로 전송하지 않아요.</p>
      </section>
    </main>
    <footer class="app-footer"><span>글결 <span class="footer-divider">/</span> 글씨에 담긴 나다움</span><span>직접 쓴 글자를 모아 만드는 한글 손글꼴 도구</span><button @click="saveProject">작업 파일로 안전하게 보관하기 ↗</button></footer>

    <dialog ref="dialog" class="modal" aria-labelledby="modal-title" @cancel="modal = null" @click="event => { if (event.target === dialog) modal = null }">
      <div class="modal-inner"><button class="modal-close" aria-label="닫기" @click="modal = null">×</button>
        <template v-if="modal === 'adjust'"><p class="modal-kicker">MAKE IT YOURS</p><h2 id="modal-title">조금 더, 나답게.</h2><p class="modal-description">미리보기와 다운로드 글꼴에 함께 적용돼요.</p><label class="slider-label">획 굵기 <span>{{ settings.thickness }}</span><input v-model.number="settings.thickness" type="range" min="4" max="30" aria-label="획 굵기" /></label><label class="slider-label">글자 크기 <span>{{ Math.round(settings.scale * 100) }}%</span><input v-model.number="settings.scale" type="range" min="0.7" max="1.2" step="0.01" aria-label="글자 크기" /></label><label class="slider-label">글자 간격 <span>{{ settings.spacing }}</span><input v-model.number="settings.spacing" type="range" min="-50" max="150" step="5" aria-label="글자 간격" /></label><button class="secondary-button" @click="settings = { ...DEFAULT_SETTINGS }">기본값으로</button><button class="primary-button" @click="modal = null">이 느낌으로 할게요</button></template>
        <template v-else-if="modal === 'export'"><p class="modal-kicker">A FONT, ALL YOURS</p><h2 id="modal-title">내 글씨를 글꼴로.</h2><p class="modal-description">직접 쓴 {{ allWritten.length }}글자와 공백을 OTF 파일로 만들어요.</p><label class="field-label" for="font-name">글꼴 이름</label><input id="font-name" v-model="name" class="text-input" maxlength="40" placeholder="My Geulgyeol" /><div class="export-summary"><span>담기는 글자</span><p>{{ allWritten.join(' ') || '아직 쓴 글자가 없어요.' }}</p></div><p class="export-caveat">이 글꼴에는 직접 쓴 글자만 들어가요. 안 쓴 글자는 사용하는 앱에 따라 기본 글꼴이나 빈 사각형으로 표시될 수 있어요. 수정하려면 작업 파일도 함께 보관해주세요.</p><button class="primary-button" :disabled="!allWritten.length || busy" @click="exportFont">{{ busy ? '글꼴을 만들고 있어요…' : 'OTF 글꼴 다운로드 ↓' }}</button><button class="secondary-button" @click="saveProject">편집용 작업 파일 저장</button></template>
        <template v-else-if="modal === 'characters'"><p class="modal-kicker">ONE LETTER AT A TIME</p><h2 id="modal-title">다음엔 뭘 써볼까요?</h2><p class="modal-description">단어나 문장을 넣으면 필요한 글자만 추가해요.<br />같은 글자는 한 번만. 한 작업에 최대 200글자.</p><div class="preset-buttons"><button @click="customText = '사랑해 고마워 행복한 생일 축하해 늘 함께하자'">마음을 전하는 말</button><button @click="customText = '월화수목금토일 년월일 0123456789!?.,:()-'">날짜와 숫자</button><button @click="customText = '가나다라마바사아자차카타파하'">가나다 기초</button></div><label class="field-label" for="custom-characters">쓰고 싶은 문장</label><textarea id="custom-characters" v-model="customText" maxlength="500" class="text-input" rows="4" placeholder="예: 너의 모든 순간을 응원해" /><button class="primary-button" @click="addCharacters(customText)">글자 추가하기 +</button></template>
      </div>
    </dialog>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
