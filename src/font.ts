import { getStroke } from 'perfect-freehand'

export type Point = [number, number, number]
export type Stroke = Point[]
export type Glyphs = Record<string, Stroke[]>
export interface Settings { thickness: number; scale: number; spacing: number }
export interface Project { version: 1; glyphs: Glyphs; characters: string[]; settings: Settings; preview: string; name: string }
export const STARTER = '안녕하세요 나만의 손글씨로 오늘을 기록해요. 작은 마음이 모여 좋은 하루가 됩니다.'
export const DEFAULT_SETTINGS: Settings = { thickness: 13, scale: 1, spacing: 0 }
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
export const hasInk = (strokes?: Stroke[]) => !!strokes?.some(stroke => stroke.length > 0)

export function outline(stroke: Stroke, thickness: number) {
  return getStroke(stroke, { size: thickness, thinning: 0.35, smoothing: 0.65, streamline: 0.4, simulatePressure: false, last: true })
}
export function strokePath(stroke: Stroke, thickness: number): string {
  const points = outline(stroke, thickness)
  if (!points.length) return ''
  return `M${points.map(point => `${point[0]},${point[1]}`).join('L')}Z`
}

export function parseProject(text: string): Project {
  if (text.length > 12_000_000) throw new Error('작업 파일은 12MB 이하로 불러올 수 있어요.')
  const data = JSON.parse(text)
  if (!data || data.version !== 1 || !Array.isArray(data.characters) || data.characters.length > 200 || !data.glyphs || typeof data.glyphs !== 'object' || Array.isArray(data.glyphs)) throw new Error('글결에서 저장한 작업 파일을 선택해주세요.')
  const validChar = (char: unknown): char is string => typeof char === 'string' && [...char].length === 1 && !/\s/u.test(char)
  if (!data.characters.every(validChar)) throw new Error('글자 목록이 올바르지 않아요.')
  const glyphs: Glyphs = Object.create(null)
  let total = 0
  if (Object.keys(data.glyphs).length > 200) throw new Error('최대 200글자까지 불러올 수 있어요.')
  for (const [char, strokes] of Object.entries(data.glyphs)) {
    if (!validChar(char) || !Array.isArray(strokes) || strokes.length > 200) throw new Error('손글씨 데이터가 올바르지 않아요.')
    glyphs[char] = strokes.map(stroke => {
      if (!Array.isArray(stroke) || !stroke.length || stroke.length > 10_000) throw new Error('획 데이터가 올바르지 않아요.')
      total += stroke.length
      if (total > 200_000) throw new Error('작업 파일의 획 데이터가 너무 많아요.')
      return stroke.map(point => {
        if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite) || point[0] < 0 || point[0] > 500 || point[1] < 0 || point[1] > 500 || point[2] < 0 || point[2] > 1) throw new Error('획 좌표가 올바르지 않아요.')
        return [...point] as Point
      })
    })
  }
  const settings = data.settings
  if (!settings || !Number.isFinite(settings.thickness) || settings.thickness < 4 || settings.thickness > 30 || !Number.isFinite(settings.scale) || settings.scale < 0.7 || settings.scale > 1.2 || !Number.isFinite(settings.spacing) || settings.spacing < -50 || settings.spacing > 150) throw new Error('글꼴 조절 값이 올바르지 않아요.')
  return { version: 1, glyphs, characters: [...new Set([...data.characters, ...Object.keys(glyphs)])].slice(0, 200), settings: { ...settings }, preview: typeof data.preview === 'string' ? data.preview.slice(0, 500) : STARTER, name: typeof data.name === 'string' ? data.name.slice(0, 40) : 'My Geulgyeol' }
}

export async function createFont(glyphs: Glyphs, settings: Settings, name: string): Promise<ArrayBuffer> {
  const { Font, Glyph, Path } = await import('opentype.js')
  const missing = new Path()
  missing.moveTo(180, 0); missing.lineTo(180, 700); missing.lineTo(820, 700); missing.lineTo(820, 0); missing.close()
  missing.moveTo(230, 50); missing.lineTo(770, 50); missing.lineTo(770, 650); missing.lineTo(230, 650); missing.close()
  const entries = [new Glyph({ name: '.notdef', advanceWidth: 1000, path: missing }), new Glyph({ name: 'space', unicode: 32, advanceWidth: 500 + settings.spacing, path: new Path() })]
  for (const [char, strokes] of Object.entries(glyphs)) {
    if (!hasInk(strokes)) continue
    const path = new Path()
    const transform = glyphTransform(settings.scale)
    for (const stroke of strokes) {
      const points = outline(stroke, settings.thickness)
      if (!points.length) continue
      // Keep every contour's winding consistent so crossing pen strokes stay filled.
      const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p[0]! * q[1]! - q[0]! * p[1]! }, 0)
      if (area < 0) points.reverse()
      points.forEach((p, index) => {
        const x = (p[0]! * transform.factor + transform.x) * 2
        const y = 800 - (p[1]! * transform.factor + transform.y) * 2
        if (index === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      })
      path.close()
    }
    const code = char.codePointAt(0)!
    entries.push(new Glyph({ name: `uni${code.toString(16).toUpperCase()}`, unicode: code, advanceWidth: 1000 + settings.spacing, path }))
  }
  if (entries.length === 2) throw new Error('글자를 하나 이상 쓴 뒤 다운로드해주세요.')
  // CFF requires an ASCII PostScript name even when the displayed family name is Korean.
  const familyName = name.trim() || 'My Geulgyeol'
  const suffix = [...familyName].map(char => char.codePointAt(0)!.toString(16)).join('').slice(0, 40)
  const font = new Font({ familyName, postScriptName: `Geulgyeol-${suffix}`, styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: entries })
  return font.toArrayBuffer()
}

export function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
