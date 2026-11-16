import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import opentype from 'opentype.js'

async function draw(page: Page) {
  const pad = page.locator('.writing-pad')
  await pad.scrollIntoViewIfNeeded()
  const bounds = (await pad.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .3)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .3, { steps: 10 })
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .65, { steps: 10 })
  await page.mouse.up()
}

test('write, preview, undo and reload preserve actual strokes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '‘안’을 써주세요.' })).toBeVisible()
  await draw(page)
  await expect(page.locator('.ink path')).toHaveCount(1)
  await expect(page.locator('.preview-glyph')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '안, 작성 완료', exact: true })).toBeVisible()
  await expect(page.locator('.save-state')).toContainText('저장됨')
  await page.reload()
  await expect(page.locator('.ink path')).toHaveCount(1)
  await page.getByRole('button', { name: '한 획 취소' }).click()
  await expect(page.locator('.ink path')).toHaveCount(0)
  await expect(page.locator('.preview-glyph')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('custom text deduplicates characters and touch taps produce ink', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '글자 추가 +', exact: true }).click()
  await page.getByLabel('쓰고 싶은 문장').fill('꿈꿈 꿈')
  await page.getByRole('button', { name: '글자 추가하기 +' }).click()
  await expect(page.getByRole('heading', { name: '‘꿈’을 써주세요.' })).toBeVisible()
  await expect(page.locator('.letter-grid button').filter({ hasText: '꿈' })).toHaveCount(1)
  const pad = page.locator('.writing-pad')
  await pad.scrollIntoViewIfNeeded()
  const box = (await pad.boundingBox())!
  await pad.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 })
  await pad.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 })
  await expect(page.locator('.ink path')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('exported OTF contains drawn Hangul and loads as a real font', async ({ page }) => {
  await page.goto('/')
  await draw(page)
  await page.getByRole('button', { name: '글꼴 조절', exact: true }).click()
  await page.getByRole('slider', { name: '글자 간격' }).press('End')
  await page.getByRole('button', { name: '이 느낌으로 할게요' }).click()
  await page.getByRole('button', { name: '글꼴 내보내기' }).click()
  await page.getByLabel('글꼴 이름').fill('나의 손글씨')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'OTF 글꼴 다운로드 ↓' }).click()
  const download = await downloadPromise
  const data = await readFile((await download.path())!)
  expect(data.subarray(0, 4).toString()).toBe('OTTO')
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const font = opentype.parse(buffer)
  expect(font.charToGlyphIndex('안')).toBeGreaterThan(0)
  expect(font.charToGlyphIndex('녕')).toBe(0)
  expect(font.charToGlyph('안').advanceWidth).toBe(1150)
  expect(font.charToGlyph('안').path.commands.length).toBeGreaterThan(20)
  const state = await page.evaluate(async bytes => {
    const face = new FontFace('ExportTest', new Uint8Array(bytes))
    await face.load()
    return face.status
  }, [...data])
  expect(state).toBe('loaded')
})

test('project JSON round-trip restores ink, settings and preview', async ({ page }) => {
  await page.goto('/')
  await draw(page)
  await page.getByLabel('미리보기 문장').fill('안녕, 나의 글씨')
  const pending = page.waitForEvent('download')
  // Footer is available on both mobile and desktop.
  await page.getByRole('button', { name: '작업 파일로 안전하게 보관하기 ↗' }).click()
  const file = await pending
  const data = await readFile((await file.path())!)
  await page.addInitScript(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.ink path')).toHaveCount(0)
  await page.getByLabel('글결 작업 파일 불러오기').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: data })
  await expect(page.locator('.ink path')).toHaveCount(1)
  await expect(page.getByLabel('미리보기 문장')).toHaveValue('안녕, 나의 글씨')
  await page.getByLabel('글결 작업 파일 불러오기').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"characters":["안"],"glyphs":{"안":[[[null,1,0.5]]]},"settings":{}}') })
  await expect(page.getByRole('status')).toContainText('획 좌표가 올바르지 않아요')
  await expect(page.locator('.ink path')).toHaveCount(1)
})
