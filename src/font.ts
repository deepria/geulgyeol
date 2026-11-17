import { isBrushId, orientContour, strokeBrush, strokeContours, strokePoints, type BrushId, type Contour, type Point, type Stroke } from './brushes'
export type { Point, Stroke } from './brushes'
import { MAX_BASE_BYTES, openType, readBaseFont, preserveLayoutTables, renameFont, scaleCustomPath, type BaseFontRecord } from './base-font'
import { availableCharacters, compositionParts, placeStrokes, SLOT_BY_ID, type Components } from './hangul'

export type Glyphs = Record<string, Stroke[]>
export interface Settings { thickness: number; scale: number; spacing: number; brush?: BrushId }
export interface Project { version: 4; glyphs: Glyphs; components: Components; characters: string[]; settings: Settings; preview: string; name: string; mode: 'direct' | 'compose'; baseFont?: BaseFontRecord; baseTargets: string[] }
export const STARTER = '안녕하세요 나만의 손글씨로 오늘을 기록해요. 작은 마음이 모여 좋은 하루가 됩니다.'
export const DEFAULT_SETTINGS: Settings = { thickness: 13, scale: 1, spacing: 0, brush: 'pen' }
// The faint reference is a 285-unit font inside a 500-unit writing area.
// Convert its em size and baseline, rather than shrinking the pad and its margins.
export const WRITING_REFERENCE = { fontSize: 285, centerX: 250, baseline: 353 } as const
export function glyphTransform(scale: number) {
  const factor = 500 / WRITING_REFERENCE.fontSize * scale
  return {
    factor,
    x: 250 - WRITING_REFERENCE.centerX * factor,
    y: 250 + (400 - 250) * scale - WRITING_REFERENCE.baseline * factor,
  }
}
export function previewTransform(scale: number): string {
  const transform = glyphTransform(scale)
  return `matrix(${transform.factor} 0 0 ${transform.factor} ${transform.x} ${transform.y})`
}
export const uniqueCharacters = (text: string) => [...new Set([...text.normalize('NFC')].filter(char => !/\s/u.test(char)))].slice(0, 200)
export const hasInk = (strokes?: Stroke[]) => !!strokes?.some(stroke => strokePoints(stroke).length > 0)

export function strokePath(stroke: Stroke, thickness: number): string {
  return strokeContours(stroke, thickness).map(contour => {
    const points = orientContour(contour)
    return points.length ? `M${points.map(point => `${point[0]},${point[1]}`).join('L')}Z` : ''
  }).join('')
}

export function parseProject(text: string): Project {
  if (text.length > 64_000_000) throw new Error('작업 파일은 64MB 이하로 불러올 수 있어요.')
  const data = JSON.parse(text)
  if (!data || ![1, 2, 3, 4].includes(data.version) || !Array.isArray(data.characters) || data.characters.length > 200) throw new Error('글결에서 저장한 작업 파일을 선택해주세요.')
  const validChar = (char: unknown): char is string => typeof char === 'string' && [...char].length === 1 && !/\s/u.test(char)
  if (!data.characters.every(validChar)) throw new Error('글자 목록이 올바르지 않아요.')
  let total = 0
  function readStrokes(value: unknown, components: boolean): Glyphs {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > (components ? 172 : 200)) throw new Error('손글씨 데이터가 올바르지 않아요.')
    const result: Glyphs = Object.create(null)
    for (const [key, strokes] of Object.entries(value)) {
      if (!(components ? Object.hasOwn(SLOT_BY_ID, key) : validChar(key)) || !Array.isArray(strokes) || strokes.length > 200) throw new Error('손글씨 데이터가 올바르지 않아요.')
      result[key] = strokes.map(stroke => {
        const points = Array.isArray(stroke) ? stroke : stroke?.points
        const brush = Array.isArray(stroke) ? 'pen' : stroke?.brush
        if (!isBrushId(brush) || !Array.isArray(points) || !points.length || points.length > 10_000) throw new Error('획 데이터가 올바르지 않아요.')
        total += points.length
        if (total > 400_000) throw new Error('작업 파일의 획 데이터가 너무 많아요.')
        return { brush, points: points.map(point => {
          if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite) || point[0] < 0 || point[0] > 500 || point[1] < 0 || point[1] > 500 || point[2] < 0 || point[2] > 1) throw new Error('획 좌표가 올바르지 않아요.')
          return [...point] as Point
        }) }
      })
    }
    return result
  }
  const glyphs = readStrokes(data.glyphs, false)
  const components = readStrokes(data.version === 1 ? {} : data.components, true)
  const settings = data.settings
  if (!settings || !Number.isFinite(settings.thickness) || settings.thickness < 4 || settings.thickness > 30 || !Number.isFinite(settings.scale) || settings.scale < 0.7 || settings.scale > 1.2 || !Number.isFinite(settings.spacing) || settings.spacing < -50 || settings.spacing > 150 || (settings.brush !== undefined && !isBrushId(settings.brush))) throw new Error('글꼴 조절 값이 올바르지 않아요.')
  let baseFont: BaseFontRecord | undefined
  if (data.version === 4 && data.baseFont !== undefined) {
    const record = data.baseFont
    if (!record || typeof record.fileName !== 'string' || record.fileName.length > 120 || !/^[a-f0-9]{64}$/.test(record.id) || (record.data !== undefined && (typeof record.data !== 'string' || record.data.length > Math.ceil(MAX_BASE_BYTES / 3) * 4))) throw new Error('베이스 폰트 정보가 올바르지 않아요.')
    baseFont = { fileName: record.fileName, id: record.id, ...(record.data === undefined ? {} : { data: record.data }) }
  }
  const targets = data.version === 4 ? data.baseTargets ?? [] : []
  if (!Array.isArray(targets) || targets.length > 200 || !targets.every(validChar)) throw new Error('커스텀할 글자 목록이 올바르지 않아요.')
  return { version: 4, baseFont, baseTargets: [...new Set(targets)], glyphs, components, characters: [...new Set([...data.characters, ...Object.keys(glyphs)])].slice(0, 200), settings: { thickness: settings.thickness, scale: settings.scale, spacing: settings.spacing, brush: settings.brush ?? 'pen' }, preview: typeof data.preview === 'string' ? data.preview.slice(0, 500) : STARTER, name: typeof data.name === 'string' ? data.name.slice(0, 40) : 'My Geulgyeol', mode: data.mode === 'compose' ? 'compose' : 'direct' }
}

// Reduce redundant outline points before expanding shared components into 11,172 glyphs.
// Tolerance is below one input-pad unit; stroke shapes and holes remain intact.
function simplifyContour(points: number[][], tolerance = .65): number[][] {
  function simplifyOpen(input: number[][]): number[][] {
    if (input.length <= 2) return input
    const keep = new Set([0, input.length - 1]), pending = [[0, input.length - 1]]
    while (pending.length) {
      const [start, end] = pending.pop()!, a = input[start!]!, b = input[end!]!
      let farthest = -1, distance = tolerance * tolerance
      for (let i = start! + 1; i < end!; i++) {
        const p = input[i]!, dx = b[0]! - a[0]!, dy = b[1]! - a[1]!
        const t = Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / (dx * dx + dy * dy || 1)))
        const d = (p[0]! - a[0]! - t * dx) ** 2 + (p[1]! - a[1]! - t * dy) ** 2
        if (d > distance) { distance = d; farthest = i }
      }
      if (farthest !== -1) { keep.add(farthest); pending.push([start!, farthest], [farthest, end!]) }
    }
    return [...keep].sort((a,b) => a-b).map(i => input[i]!)
  }
  if (points.length < 8) return points
  const half = Math.floor(points.length / 2)
  return [...simplifyOpen(points.slice(0, half + 1)), ...simplifyOpen([...points.slice(half), points[0]!]).slice(1, -1)]
}

export async function createFont(glyphs: Glyphs, settings: Settings, name: string, components: Components = {}, onProgress?: (completed: number, total: number) => void, baseInput?: { buffer: ArrayBuffer; targets: string[] }): Promise<ArrayBuffer> {
  const { Font, Glyph, Path } = await openType()
  const missing = new Path()
  missing.moveTo(180, 0); missing.lineTo(180, 700); missing.lineTo(820, 700); missing.lineTo(820, 0); missing.close()
  missing.moveTo(230, 50); missing.lineTo(770, 50); missing.lineTo(770, 650); missing.lineTo(230, 650); missing.close()
  const base = baseInput ? await readBaseFont(baseInput.buffer, 'base-font') : undefined
  const entries = base ? [] : [new Glyph({ name: '.notdef', advanceWidth: 1000, path: missing }), new Glyph({ name: 'space', unicode: 32, advanceWidth: 500 + settings.spacing, path: new Path() })]
  const characters = availableCharacters(glyphs, components).filter(char => !baseInput || baseInput.targets.includes(char))
  const originalAliases = new Map<number, number[]>()
  if (base) {
    for (const [code,index] of base.codes) { if (!originalAliases.has(index)) originalAliases.set(index,[]); originalAliases.get(index)!.push(code) }
    for (let index=0;index<base.font.glyphs.length;index++) {
      const glyph = base.font.glyphs.get(index)
      glyph.unicodes = [...originalAliases.get(index) ?? []]
      glyph.unicode = glyph.unicodes[0]
    }
  }
  const cache = new Map<string, Contour[]>()
  const transform = glyphTransform(settings.scale)
  for (let index = 0; index < characters.length; index++) {
    const char = characters[index]!
    if (index % 96 === 0) { onProgress?.(index, characters.length); await new Promise(resolve => setTimeout(resolve, 0)) }
    const path = new Path()
    const contours = hasInk(glyphs[char]) ? glyphs[char]!.flatMap(stroke => strokeContours(stroke, settings.thickness)) : compositionParts(char).flatMap(({ slot, box }) => {
      const key = `${slot.id}:${box.x},${box.y},${box.width},${box.height}`
      if (!cache.has(key)) cache.set(key, placeStrokes(components[slot.id]!, slot.box, box).flatMap(stroke => strokeContours(stroke, settings.thickness).map(contour => ({ ...contour, points: contour.hole ? contour.points : simplifyContour(contour.points, strokeBrush(stroke) === 'pencil' ? .4 : .65) }))))
      return cache.get(key)!
    })
    for (const contour of contours) {
      const points = orientContour(contour)
      if (!points.length) continue
      points.forEach((p, index) => {
        const x = (p[0]! * transform.factor + transform.x) * 2
        const y = 800 - (p[1]! * transform.factor + transform.y) * 2
        if (index === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      })
      path.close()
    }
    const code = char.codePointAt(0)!
    if (base) {
      const index = base.codes.get(code), original = index === undefined ? undefined : base.font.glyphs.get(index)
      const advance = original?.advanceWidth ?? base.font.unitsPerEm
      scaleCustomPath(path, advance || base.font.unitsPerEm, base.font.unitsPerEm)
      if (original && original.unicodes.length === 1) original.path = path
      else {
        if (original) { original.unicodes = original.unicodes.filter(value=>value!==code); original.unicode=original.unicodes[0] }
        if (base.font.glyphs.length >= 65535) throw new Error('폰트에 추가할 수 있는 글자 수를 초과했어요.')
        const glyph = new Glyph({ name:`custom${code.toString(16)}`,unicode:code,advanceWidth:advance,path })
        base.font.glyphs.push(base.font.glyphs.length,()=>glyph)
      }
    } else entries.push(new Glyph({ name: `uni${code.toString(16).toUpperCase()}`, unicode: code, advanceWidth: 1000 + settings.spacing, path }))
  }
  if (!base && entries.length === 2) throw new Error('글자를 하나 이상 쓴 뒤 다운로드해주세요.')
  // CFF requires an ASCII PostScript name even when the displayed family name is Korean.
  const familyName = name.trim() || 'My Geulgyeol'
  const suffix = [...familyName].map(char => char.codePointAt(0)!.toString(16)).join('').slice(0, 40)
  const font = base?.font ?? new Font({ familyName, postScriptName: `Geulgyeol-${suffix}`, styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: entries })
  if (base) {
    renameFont(font, familyName)
    for (let index=0;index<font.glyphs.length;index++) {
      const glyph=font.glyphs.get(index)
      // CFF paths are lazy and still need the original dictionaries while decoding.
      glyph.path = glyph.path
      glyph.advanceWidth=Math.max(0,(glyph.advanceWidth ?? font.unitsPerEm)+settings.spacing*font.unitsPerEm/1000)
    }
    const codes=Array.from({length:font.glyphs.length},(_,index)=>font.glyphs.get(index).unicodes).flat()
    const os2=font.tables.os2
    if(os2){
      os2.usFirstCharIndex=codes.reduce((min,code)=>Math.min(min,code),0xffff)
      os2.usLastCharIndex=Math.min(0xffff,codes.reduce((max,code)=>Math.max(max,code),0))
      for(const field of ['xAvgCharWidth','ulUnicodeRange1','ulUnicodeRange2','ulUnicodeRange3','ulUnicodeRange4'])delete os2[field]
    }
    // Layout tables are restored as raw bytes after writing, keeping original glyph IDs.
    // TrueType hinting and CID-specific CFF dictionaries cannot be reused for new CFF outlines.
    for (const tag of ['gsub','gpos','gdef','kern','cff','stat','gasp']) delete font.tables[tag]
  }
  onProgress?.(characters.length, characters.length)
  const result = font.toArrayBuffer()
  return baseInput ? preserveLayoutTables(result, baseInput.buffer) : result
}

export function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
