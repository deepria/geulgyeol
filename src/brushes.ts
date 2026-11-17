import { getStroke } from 'perfect-freehand'

export const BRUSHES = [
  { id: 'pen', name: '기본 펜', description: '둥글고 부드러운 필압 펜' },
  { id: 'fineliner', name: '가는 펜', description: '일정한 굵기의 또렷한 선' },
  { id: 'pencil', name: '연필', description: '잔결이 있는 가벼운 흑연 느낌' },
  { id: 'brush', name: '붓펜', description: '가늘게 시작하고 끝나는 탄력 있는 선' },
  { id: 'calligraphy', name: '납작 펜', description: '기울어진 펜촉의 굵고 가는 선' },
] as const
export type BrushId = typeof BRUSHES[number]['id']
export type Point = [number, number, number]
export interface BrushStroke { points: Point[]; brush: BrushId }
// Arrays remain accepted internally for legacy projects and reference guides.
export type Stroke = Point[] | BrushStroke
export interface Contour { points: number[][]; hole?: boolean }
export const isBrushId = (value: unknown): value is BrushId => BRUSHES.some(brush => brush.id === value)
export const strokePoints = (stroke: Stroke): Point[] => Array.isArray(stroke) ? stroke : stroke.points
export const strokeBrush = (stroke: Stroke): BrushId => Array.isArray(stroke) ? 'pen' : stroke.brush
export const restyleStroke = (stroke: Stroke, brush: BrushId): BrushStroke => ({ points: strokePoints(stroke).map(point => [...point] as Point), brush })
export const withPoints = (stroke: Stroke, points: Point[]): Stroke => Array.isArray(stroke) ? points : { points, brush: stroke.brush }

export function orientContour(contour: Contour): number[][] {
  const points = contour.points
  const area = points.reduce((sum, p, index) => { const q = points[(index + 1) % points.length]!; return sum + p[0]! * q[1]! - q[0]! * p[1]! }, 0)
  return (area < 0) !== !!contour.hole ? [...points].reverse() : points
}
function inside(x: number, y: number, polygon: number[][]): boolean {
  let found = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if ((a[1]! > y) !== (b[1]! > y) && x < (b[0]! - a[0]!) * (y - a[1]!) / (b[1]! - a[1]!) + a[0]!) found = !found
  }
  return found
}
function sampleLine(points: Point[], fraction: number): Point {
  const lengths = points.slice(1).map((p,i) => Math.hypot(p[0] - points[i]![0],p[1] - points[i]![1]))
  const distance = lengths.reduce((sum,length) => sum+length,0) * fraction
  let travelled = 0
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!
    if (travelled + length >= distance && length > 0) {
      const t=(distance-travelled)/length, a=points[i]!, b=points[i+1]!
      return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]
    }
    travelled += length
  }
  return points.at(-1)!
}

export function strokeContours(stroke: Stroke, thickness: number): Contour[] {
  const points = strokePoints(stroke), brush = strokeBrush(stroke)
  if (!points.length) return []
  const common = { size: thickness, thinning: .35, smoothing: .65, streamline: .4, simulatePressure: false, last: true }
  if (brush === 'fineliner') return [{ points: getStroke(points, { ...common, size: thickness * .55, thinning: 0, smoothing: .75 }) }]
  if (brush === 'brush') return [{ points: getStroke(points, { ...common, size: thickness * 1.3, thinning: .8, easing: p => p * p, start: { taper: points.length > 2 ? thickness * 1.2 : 0 }, end: { taper: points.length > 2 ? thickness * 2 : 0 } }) }]
  if (brush === 'calligraphy') {
    const c = Math.SQRT1_2, s = -Math.SQRT1_2, aspect = .24
    const transformed = points.map(([x,y,p]) => [c*x+s*y,(-s*x+c*y)/aspect,p])
    const contour = getStroke(transformed, { ...common, size: thickness * 1.6, thinning: .2, streamline: .15 })
    return [{ points: contour.map(([x,y]) => [c*x!-s*y!*aspect,s*x!+c*y!*aspect]) }]
  }
  if (brush !== 'pencil') return [{ points: getStroke(points, common) }]
  const size = thickness * .8
  const edge = getStroke(points, { ...common, size, thinning: .15, smoothing: .4, streamline: .25 }).map(([x,y]) => [x!+Math.sin(x!*.12+y!*.083)*size*.08,y!+Math.sin(y!*.14-x!*.061)*size*.08])
  const contours: Contour[] = [{ points: edge }]
  // Sparse deterministic vector pores: no raster texture or alpha effects that OTF would lose.
  // Keep the count bounded so a complete 11,172-glyph font remains practical to export.
  const length = points.slice(1).reduce((sum,p,i) => sum+Math.hypot(p[0]-points[i]![0],p[1]-points[i]![1]),0)
  const count = Math.min(4,Math.floor(length / Math.max(size*2,12)))
  for (let i=0;i<count;i++) {
    const p=sampleLine(points,(i+1)/(count+1)), r=size*.12
    const x=p[0]+Math.sin(p[1]*.37)*size*.08, y=p[1]+Math.sin(p[0]*.29)*size*.08
    const pore=[[x-r,y+r*.5],[x+r*.8,y+r*.3],[x+r*.1,y-r]]
    if (pore.every(point => inside(point[0]!,point[1]!,edge))) contours.push({points:pore,hole:true})
  }
  return contours
}

export const BRUSH_SAMPLE: Point[] = Array.from({ length: 65 }, (_,index) => {
  const t=index/64
  return [8+t*104,21+Math.sin(t*Math.PI*2)*9,.18+Math.sin(t*Math.PI)*.7]
})
