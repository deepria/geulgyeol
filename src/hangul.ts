import type { Glyphs, Point, Stroke } from './font'

export const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ']
export const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ']
export const FINALS = [...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
export type PartKind = 'initial' | 'vowel' | 'final'
export type Components = Record<string, Stroke[]>
export interface Box { x: number; y: number; width: number; height: number }
export interface PartSlot { id: string; kind: PartKind; variant: number; index: number; char: string; description: string; example: string; box: Box }
export type GlyphSource = 'direct' | 'composed' | 'missing'
const ink = (strokes?: Stroke[]) => !!strokes?.some(stroke => stroke.length)
const vertical = (vowel: number) => vowel < 8 || vowel === 20
const mixed = (vowel: number) => [9, 10, 11, 14, 15, 16, 19].includes(vowel)
const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height })

export function syllable(initial: number, vowel: number, final = 0) { return String.fromCodePoint(0xac00 + (initial * 21 + vowel) * 28 + final) }
export function decompose(char: string) {
  const code = char.codePointAt(0)! - 0xac00
  if (code < 0 || code >= 11172) return null
  return { initial: Math.floor(code / 588), vowel: Math.floor(code / 28) % 21, final: code % 28 }
}
export function layout(vowel: number, final: boolean) {
  if (vertical(vowel)) return {
    initial: box(110, 105, 145, final ? 155 : 250),
    vowel: box(280, 105, 110, final ? 155 : 250),
    final: box(115, 295, 270, 65),
  }
  return {
    initial: mixed(vowel) ? box(115, 105, 155, final ? 95 : 145) : box(130, 105, 240, final ? 95 : 145),
    vowel: mixed(vowel) ? box(110, 105, 280, final ? 160 : 250) : box(110, final ? 225 : 285, 280, final ? 35 : 70),
    final: box(110, 295, 280, 65),
  }
}
export const VARIANT_LABELS: Record<PartKind, string[]> = {
  initial: ['받침 없음 · 세로 모음 (가)', '받침 없음 · 가로·복합 모음 (고·과)', '받침 있음 · 세로 모음 (각)', '받침 있음 · 가로·복합 모음 (곡·곽)'],
  vowel: ['받침 없는 글자 (가·고)', '받침 있는 글자 (각·곡)'],
  final: ['세로 모음 아래 (각)', '가로·복합 모음 아래 (곡·곽)'],
}
export const PART_SLOTS: PartSlot[] = (['initial', 'vowel', 'final'] as PartKind[]).flatMap(kind =>
  VARIANT_LABELS[kind].flatMap((description, variant) => {
    const chars = kind === 'initial' ? INITIALS : kind === 'vowel' ? VOWELS : FINALS
    return chars.map((char, index) => {
      const vowel = kind === 'vowel' ? index : (kind === 'initial' ? variant % 2 : variant) ? 8 : 0
      const withFinal = kind === 'initial' ? variant >= 2 : kind === 'vowel' ? variant === 1 : true
      return { id: `${kind}:${variant}:${index}`, kind, variant, index, char, description,
        example: syllable(kind === 'initial' ? index : 0, vowel, kind === 'final' ? index + 1 : withFinal ? 1 : 0),
        box: layout(vowel, withFinal)[kind] }
    })
  }))
export const SLOT_BY_ID = Object.fromEntries(PART_SLOTS.map(slot => [slot.id, slot])) as Record<string, PartSlot>
export const QUICK_START = ['initial:0:0', 'vowel:0:0', 'initial:2:0', 'vowel:1:0', 'final:0:0']
export function compositionParts(char: string) {
  const code = decompose(char)
  if (!code) return []
  const { initial, vowel, final } = code
  const boxes = layout(vowel, final !== 0)
  const initialVariant = (final ? 2 : 0) + (vertical(vowel) ? 0 : 1)
  const parts = [
    { slot: SLOT_BY_ID[`initial:${initialVariant}:${initial}`]!, box: boxes.initial },
    { slot: SLOT_BY_ID[`vowel:${final ? 1 : 0}:${vowel}`]!, box: boxes.vowel },
  ]
  if (final) parts.push({ slot: SLOT_BY_ID[`final:${vertical(vowel) ? 0 : 1}:${final - 1}`]!, box: boxes.final })
  return parts
}
export function glyphSource(char: string, glyphs: Glyphs, components: Components): GlyphSource {
  if (ink(glyphs[char])) return 'direct'
  const parts = compositionParts(char)
  return parts.length && parts.every(({ slot }) => ink(components[slot.id])) ? 'composed' : 'missing'
}
export function placeStrokes(strokes: Stroke[], from: Box, to: Box): Stroke[] {
  if (from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height) return strokes
  return strokes.map(stroke => stroke.map(([x, y, pressure]) => [to.x + (x - from.x) * to.width / from.width, to.y + (y - from.y) * to.height / from.height, pressure] as Point))
}
export function resolvedStrokes(char: string, glyphs: Glyphs, components: Components): Stroke[] {
  const source = glyphSource(char, glyphs, components)
  if (source === 'direct') return glyphs[char]!
  if (source === 'missing') return []
  return compositionParts(char).flatMap(({ slot, box: target }) => placeStrokes(components[slot.id]!, slot.box, target))
}
export function availableCharacters(glyphs: Glyphs, components: Components): string[] {
  const direct = Object.keys(glyphs).filter(char => ink(glyphs[char]))
  if (!Object.values(components).some(ink)) return direct
  const chars = new Set(direct)
  for (let code = 0xac00; code <= 0xd7a3; code++) {
    const char = String.fromCodePoint(code)
    if (glyphSource(char, glyphs, components) === 'composed') chars.add(char)
  }
  return [...chars]
}

// Original skeletal guides, used only for drawing prompts; never added to a user's font.
type Line = number[][]
const line = (...points: number[][]): Line => points
const circle = (cx: number, cy: number, rx: number, ry: number): Line => Array.from({ length: 33 }, (_, i) => [cx + Math.cos(i / 32 * Math.PI * 2) * rx, cy + Math.sin(i / 32 * Math.PI * 2) * ry])
const base: Record<string, Line[]> = {
  'ㄱ': [line([.08,.08],[.92,.08],[.92,.92])],
  'ㄴ': [line([.08,.08],[.08,.92],[.92,.92])],
  'ㄷ': [line([.08,.08],[.92,.08]), line([.08,.08],[.08,.92],[.92,.92])],
  'ㄹ': [line([.08,.08],[.92,.08],[.92,.48],[.08,.48],[.08,.92],[.92,.92])],
  'ㅁ': [line([.08,.08],[.92,.08],[.92,.92],[.08,.92],[.08,.08])],
  'ㅂ': [line([.12,.08],[.12,.92],[.88,.92],[.88,.08]),line([.12,.48],[.88,.48])],
  'ㅅ': [line([.5,.08],[.08,.92]),line([.5,.08],[.92,.92])],
  'ㅇ': [circle(.5,.5,.42,.42)],
  'ㅈ': [line([.08,.08],[.92,.08]),line([.5,.08],[.08,.92]),line([.5,.08],[.92,.92])],
  'ㅊ': [line([.5,.04],[.5,.18]),line([.08,.28],[.92,.28]),line([.5,.28],[.08,.92]),line([.5,.28],[.92,.92])],
  'ㅋ': [line([.08,.08],[.92,.08],[.92,.92]),line([.08,.48],[.92,.48])],
  'ㅌ': [line([.08,.08],[.92,.08]),line([.08,.08],[.08,.92],[.92,.92]),line([.08,.48],[.92,.48])],
  'ㅍ': [line([.04,.08],[.96,.08]),line([.25,.08],[.25,.92]),line([.75,.08],[.75,.92]),line([.04,.92],[.96,.92])],
  'ㅎ': [line([.5,.03],[.5,.16]),line([.08,.25],[.92,.25]),circle(.5,.66,.34,.27)],
  'ㅏ': [line([.25,.05],[.25,.95]),line([.25,.5],[.9,.5])],
  'ㅑ': [line([.25,.05],[.25,.95]),line([.25,.33],[.9,.33]),line([.25,.66],[.9,.66])],
  'ㅓ': [line([.75,.05],[.75,.95]),line([.1,.5],[.75,.5])],
  'ㅕ': [line([.75,.05],[.75,.95]),line([.1,.33],[.75,.33]),line([.1,.66],[.75,.66])],
  'ㅗ': [line([.05,.85],[.95,.85]),line([.5,.05],[.5,.85])],
  'ㅛ': [line([.05,.85],[.95,.85]),line([.3,.05],[.3,.85]),line([.7,.05],[.7,.85])],
  'ㅜ': [line([.05,.15],[.95,.15]),line([.5,.15],[.5,.95])],
  'ㅠ': [line([.05,.15],[.95,.15]),line([.3,.15],[.3,.95]),line([.7,.15],[.7,.95])],
  'ㅡ': [line([.05,.5],[.95,.5])], 'ㅣ': [line([.5,.05],[.5,.95])],
}
const pairs: Record<string, string[]> = { 'ㄲ':['ㄱ','ㄱ'], 'ㄸ':['ㄷ','ㄷ'], 'ㅃ':['ㅂ','ㅂ'], 'ㅆ':['ㅅ','ㅅ'], 'ㅉ':['ㅈ','ㅈ'], 'ㄳ':['ㄱ','ㅅ'], 'ㄵ':['ㄴ','ㅈ'], 'ㄶ':['ㄴ','ㅎ'], 'ㄺ':['ㄹ','ㄱ'], 'ㄻ':['ㄹ','ㅁ'], 'ㄼ':['ㄹ','ㅂ'], 'ㄽ':['ㄹ','ㅅ'], 'ㄾ':['ㄹ','ㅌ'], 'ㄿ':['ㄹ','ㅍ'], 'ㅀ':['ㄹ','ㅎ'], 'ㅄ':['ㅂ','ㅅ'] }
const mapLines = (lines: Line[], region: Box) => lines.map(points => points.map(p => [region.x + p[0]! * region.width, region.y + p[1]! * region.height]))
function guideLines(char: string): Line[] {
  if (base[char]) return base[char]!
  if (pairs[char]) return pairs[char]!.flatMap((part, index) => mapLines(guideLines(part), box(index * .52, 0, .48, 1)))
  const doubleVowels: Record<string, string> = { 'ㅐ':'ㅏ', 'ㅒ':'ㅑ', 'ㅔ':'ㅓ', 'ㅖ':'ㅕ' }
  if (doubleVowels[char]) return [...mapLines(guideLines(doubleVowels[char]!), box(0,0,.65,1)), line([.92,.05],[.92,.95])]
  const compound: Record<string, string[]> = { 'ㅘ':['ㅗ','ㅏ'], 'ㅙ':['ㅗ','ㅐ'], 'ㅚ':['ㅗ','ㅣ'], 'ㅝ':['ㅜ','ㅓ'], 'ㅞ':['ㅜ','ㅔ'], 'ㅟ':['ㅜ','ㅣ'], 'ㅢ':['ㅡ','ㅣ'] }
  const pair = compound[char]
  if (!pair) return []
  return [...mapLines(guideLines(pair[0]!), box(0,.62,.62,.35)), ...mapLines(guideLines(pair[1]!), box(.68,0,.32,1))]
}
export function guideStrokes(slot: PartSlot): Stroke[] {
  return mapLines(guideLines(slot.char), slot.box).map(points => {
    const dense: Point[] = []
    points.forEach((point, index) => {
      const last = points[index - 1]
      if (!last) { dense.push([point[0]!, point[1]!, .5]); return }
      const steps = Math.max(1, Math.ceil(Math.hypot(point[0]! - last[0]!, point[1]! - last[1]!) / 4))
      for (let i = 1; i <= steps; i++) dense.push([last[0]! + (point[0]! - last[0]!) * i / steps, last[1]! + (point[1]! - last[1]!) * i / steps, .5])
    })
    return dense
  })
}
export function guidePaths(slot: PartSlot): string[] {
  return mapLines(guideLines(slot.char), slot.box).map(points => `M${points.map(([x,y]) => `${x},${y}`).join('L')}`)
}
