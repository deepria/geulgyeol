import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import opentype from 'opentype.js'
import { PART_SLOTS, SLOT_BY_ID, QUICK_START, availableCharacters, compositionParts, glyphSource, guideStrokes } from '../src/hangul'

async function tracePart(page: Page) {
  const pad = page.locator('.writing-pad')
  await pad.scrollIntoViewIfNeeded()
  const box = (await pad.boundingBox())!
  const paths = await page.locator('.part-reference').evaluateAll(nodes => nodes.map(node => (node.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)))
  for (const points of paths) {
    for (let index = 0; index < points.length; index += 2) {
      await page.mouse.move(box.x + points[index]! / 500 * box.width, box.y + points[index + 1]! / 500 * box.height, { steps: index ? 4 : 1 })
      if (!index) await page.mouse.down()
    }
    await page.mouse.up()
  }
}

test('quick start composes complete syllables and direct handwriting overrides them', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /자소 조합/ }).click()
  await page.getByRole('button', { name: '가·각 빠른 시작 ↗' }).click()
  await tracePart(page)
  await expect(page.locator('.preview-glyph')).toHaveCount(0)
  for (let index = 1; index < QUICK_START.length; index++) {
    await page.getByRole('button', { name: '다음 자소', exact: true }).click()
    await tracePart(page)
    if (index === 1) await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(1)
  }
  await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(2)
  await expect(page.locator('.coverage-note')).toContainText('2개')
  await page.getByRole('button', { name: '문장의 글자 직접 보완 ↗' }).click()
  await expect(page.getByRole('tab', { name: /직접 쓰기/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: '‘가’를 써주세요.' })).toBeVisible()
  const pad = page.locator('.writing-pad'); await pad.scrollIntoViewIfNeeded()
  const bounds = (await pad.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .3)
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .4, {steps: 5}); await page.mouse.up()
  await expect(page.locator('.preview-glyph[data-source="direct"]')).toHaveCount(1)
  await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(1)
  await page.getByRole('button', { name: '한 획 취소' }).click()
  await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(2)
  await expect(page.locator('.save-state')).toContainText('저장됨')
  await page.reload()
  await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(2)
  await page.getByRole('tab', { name: /자소 조합/ }).click()
  await expect(page.getByRole('progressbar', { name: '작성한 자소 수' })).toHaveAttribute('aria-valuenow', '5')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '작업 파일로 안전하게 보관하기 ↗' }).click()
  const json = JSON.parse((await readFile((await (await pending).path())!)).toString())
  expect(json.version).toBe(4)
  expect(QUICK_START.every(id => json.components[id]?.length)).toBe(true)
  await page.addInitScript(() => localStorage.clear())
  await page.reload()
  await page.getByLabel('글결 작업 파일 불러오기').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))})
  await expect(page.getByRole('tab', { name: /자소 조합/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('legacy projects retain their drawings and tabs support keyboard switching', async ({ page }) => {
  const old = { version:1, glyphs:{'안':[[[150,150,.5],[300,300,.5]]]},characters:['안'],settings:{thickness:13,scale:1,spacing:0},preview:'안',name:'Legacy' }
  await page.addInitScript(project => localStorage.setItem('geulgyeol.project.v1', JSON.stringify(project)), old)
  await page.goto('/')
  await expect(page.locator('.preview-glyph[data-source="direct"]')).toHaveCount(1)
  const tab = page.getByRole('tab', {name:/직접 쓰기/})
  await tab.focus(); await tab.press('ArrowRight')
  await expect(page.getByRole('tab', {name:/자소 조합/})).toBeFocused()
  await expect(page.locator('.preview-glyph[data-source="direct"]')).toHaveCount(1)
  await page.getByRole('tab', {name:/자소 조합/}).press('ArrowLeft')
  await expect(tab).toBeFocused()
  await expect(page.locator('.ink path')).toHaveCount(1)
  await expect(page.locator('.save-state')).toContainText('저장됨')
  const saved = await page.evaluate(() => ({ old: JSON.parse(localStorage.getItem('geulgyeol.project.v1')!), current: JSON.parse(localStorage.getItem('geulgyeol.project.v4')!) }))
  expect(saved.old).toEqual(old)
  expect(saved.current.version).toBe(4)
  expect(saved.current.glyphs['안'].map((stroke: {points: unknown}) => stroke.points)).toEqual(old.glyphs['안'])
  expect(saved.current.glyphs['안'][0].brush).toBe('pen')
})

test('172 contextual slots cover every modern syllable without filling missing parts', async ({}, info) => {
  test.skip(info.project.name === 'mobile', 'Pure composition rules need one run.')
  expect(PART_SLOTS.length).toBe(172)
  expect(new Set(PART_SLOTS.map(slot => slot.id)).size).toBe(172)
  const components = Object.fromEntries(PART_SLOTS.map(slot => [slot.id, guideStrokes(slot)]))
  const all = availableCharacters({}, components)
  expect(all.length).toBe(11172)
  expect(all[0]).toBe('가'); expect(all.at(-1)).toBe('힣')
  expect(compositionParts('가').map(part => part.slot.id)).toEqual(['initial:0:0','vowel:0:0'])
  expect(compositionParts('고').map(part => part.slot.id)).toEqual(['initial:1:0','vowel:0:8'])
  expect(compositionParts('곽').map(part => part.slot.id)).toEqual(['initial:3:0','vowel:1:9','final:1:0'])
  expect(glyphSource('가', {'가':[[[1,1,.5]]]}, components)).toBe('direct')
  delete components['vowel:0:0']
  expect(glyphSource('가', {}, components)).toBe('missing')
  expect(glyphSource('각', {}, components)).toBe('composed')
  expect(availableCharacters({}, components).length).toBe(11172 - 19)
  expect(glyphSource('A', {}, components)).toBe('missing')
  expect(Object.values(SLOT_BY_ID).every(slot => guideStrokes(slot).length)).toBe(true)
})

test('all 11,172 syllables export in a cancellable worker with direct overrides', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Full-font benchmark runs once; mobile covers the interactive flow.')
  test.setTimeout(120_000)
  const fixture = {version:2,components:Object.fromEntries(PART_SLOTS.map(slot=>[slot.id,guideStrokes(slot)])),glyphs:{'가':[[[240,240,.5],[250,250,.5]]]},characters:['가'],settings:{thickness:13,scale:1,spacing:0},preview:'가 고 과 괴 꿍 똠 힣',name:'조합 테스트',mode:'compose'}
  await page.addInitScript(project => localStorage.setItem('geulgyeol.project.v1', JSON.stringify(project)), fixture)
  await page.goto('/')
  await expect(page.locator('.coverage-note')).toContainText('11,172')
  await expect(page.locator('.preview-glyph[data-source="direct"]')).toHaveCount(1)
  await expect(page.locator('.preview-glyph[data-source="composed"]')).toHaveCount(6)
  await page.getByRole('button', { name:'글꼴 내보내기' }).click()
  await page.getByRole('button', { name:'OTF 글꼴 다운로드 ↓' }).click()
  await expect(page.locator('.export-progress')).toBeVisible()
  await page.getByRole('button', {name:'생성 취소',exact:true}).click()
  await expect(page.getByRole('button', {name:'OTF 글꼴 다운로드 ↓'})).toBeEnabled()
  const pending = page.waitForEvent('download', {timeout:100_000})
  await page.getByRole('button', {name:'OTF 글꼴 다운로드 ↓'}).click()
  const data = await readFile((await (await pending).path())!)
  const font = opentype.parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer)
  expect(font.numGlyphs).toBe(11174)
  for(let code=0xac00;code<=0xd7a3;code++) expect(font.charToGlyphIndex(String.fromCodePoint(code))).toBeGreaterThan(0)
  const direct = font.charToGlyph('가').getBoundingBox()
  expect(direct.x2 - direct.x1).toBeLessThan(150)
  const status = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64),c=>c.charCodeAt(0))
    const face = new FontFace('CompositionTest',bytes)
    await face.load(); return face.status
  },data.toString('base64'))
  expect(status).toBe('loaded')
  console.log(`Full Hangul font: ${(data.byteLength/1024/1024).toFixed(2)} MiB`)
})
