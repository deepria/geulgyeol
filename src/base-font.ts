import type { Font, Glyph, Path } from 'opentype.js'

export interface BaseFontRecord { fileName: string; id: string; data?: string }
export interface LoadedBaseFont { fileName: string; id: string; buffer: ArrayBuffer; font: Font; codes: Map<number, number>; characters: string[]; family: string; previewCache: Map<string, {path:string;width:number}> }
export const MAX_BASE_BYTES = 20 * 1024 * 1024
const CACHE_NAME = 'geulgyeol-fonts'
const CACHE_STORE = 'base-fonts'

export function sfntTables(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const view = new DataView(buffer)
  if (buffer.byteLength < 12 || ![0x00010000,0x4f54544f].includes(view.getUint32(0))) throw new Error('단일 정적 TTF·OTF 폰트 파일을 선택해주세요.')
  const count = view.getUint16(4)
  if (count > 128 || 12 + count * 16 > buffer.byteLength) throw new Error('올바른 폰트 파일이 아니에요.')
  const tables = new Map<string, Uint8Array>()
  for (let i=0;i<count;i++) {
    const pos=12+i*16, tag=String.fromCharCode(...new Uint8Array(buffer,pos,4)), offset=view.getUint32(pos+8), length=view.getUint32(pos+12)
    if (offset + length > buffer.byteLength || offset < 12 + count * 16 || tables.has(tag)) throw new Error('폰트 테이블이 손상되었어요.')
    tables.set(tag,new Uint8Array(buffer,offset,length))
  }
  return tables
}
export async function fontId(buffer: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(value=>value.toString(16).padStart(2,'0')).join('')
}
export async function openType() {
  const module = await import('opentype.js')
  return 'default' in module ? module.default as typeof module : module
}
export async function readBaseFont(buffer: ArrayBuffer, fileName: string): Promise<LoadedBaseFont> {
  if (!buffer.byteLength || buffer.byteLength > MAX_BASE_BYTES) throw new Error('베이스 폰트는 20MB 이하로 선택해주세요.')
  const tables=sfntTables(buffer)
  if (['fvar','gvar','CFF2'].some(tag=>tables.has(tag))) throw new Error('가변 폰트는 지원하지 않아요. 원하는 굵기의 정적 TTF·OTF 파일을 선택해주세요.')
  if (['COLR','CPAL','SVG ','CBDT','CBLC','sbix'].some(tag=>tables.has(tag))) throw new Error('컬러·이미지 폰트는 지원하지 않아요. 단색 윤곽선 TTF·OTF를 선택해주세요.')
  if (!tables.has('glyf') && !tables.has('CFF ')) throw new Error('글자의 윤곽선이 없는 폰트예요.')
  const {parse}=await openType()
  let font: Font
  try { font=parse(buffer) } catch { throw new Error('이 폰트를 읽지 못했어요. 다른 정적 TTF·OTF 파일을 선택해주세요.') }
  if (!Number.isFinite(font.unitsPerEm) || font.unitsPerEm < 16 || font.unitsPerEm > 16384 || !font.glyphs.length || font.glyphs.length > 65535) throw new Error('지원하지 않는 폰트 구성입니다.')
  const cmap=font.tables.cmap?.glyphIndexMap as Record<string,number> | undefined
  const codes=new Map<number,number>()
  for (const [value,index] of Object.entries(cmap ?? {})) {
    const code=Number(value)
    if (Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code>=0xd800 && code<=0xdfff) && index>0 && index<font.glyphs.length) codes.set(code,index)
  }
  if (!codes.size) throw new Error('사용할 수 있는 문자 매핑이 없는 폰트예요.')
  return {fileName:fileName.slice(0,120), id:await fontId(buffer),buffer,font,codes,characters:[...codes.keys()].filter(code=>!/^\s$/u.test(String.fromCodePoint(code))).map(code=>String.fromCodePoint(code)),family:font.getEnglishName('fontFamily') || fileName,previewCache:new Map()}
}
export function encodeFont(buffer: ArrayBuffer): string {
  const bytes=new Uint8Array(buffer), parts:string[]=[]
  for(let i=0;i<bytes.length;i+=8192)parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)))
  return btoa(parts.join(''))
}
export function decodeFont(data: string): ArrayBuffer {
  if (!data || data.length>Math.ceil(MAX_BASE_BYTES/3)*4 || data.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('작업 파일의 베이스 폰트 데이터가 올바르지 않아요.')
  try { const text=atob(data); if(text.length>MAX_BASE_BYTES)throw new Error(); return Uint8Array.from(text,char=>char.charCodeAt(0)).buffer }
  catch { throw new Error('작업 파일의 베이스 폰트 데이터를 읽지 못했어요.') }
}
export function baseGlyph(base: LoadedBaseFont, char: string): Glyph | undefined {
  const index=base.codes.get(char.codePointAt(0)!)
  return index===undefined ? undefined : base.font.glyphs.get(index)
}
export function baseAdvance(base: LoadedBaseFont, char: string): number { return (baseGlyph(base,char)?.advanceWidth ?? base.font.unitsPerEm) / base.font.unitsPerEm }
export function basePreview(base: LoadedBaseFont,char:string): {path:string;width:number} | undefined {
  const glyph=baseGlyph(base,char)
  if (!glyph) return undefined
  if (base.previewCache.has(char))return base.previewCache.get(char)
  const width=baseAdvance(base,char)
  const normalized=glyph.getPath(0,400,500)
  // SVG cells use the original character's advance width while sharing one baseline.
  for(const command of normalized.commands) {
    if('x' in command)command.x/=width || 1
    if('x1' in command)command.x1/=width || 1
    if('x2' in command)command.x2/=width || 1
  }
  const result={path:normalized.toPathData(3),width}
  base.previewCache.set(char,result)
  return result
}

async function cacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(CACHE_NAME,1)
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(CACHE_STORE))request.result.createObjectStore(CACHE_STORE)}
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(new Error('폰트 저장소를 열지 못했어요.'))
  })
}
async function cacheOperation<T>(mode:IDBTransactionMode, action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await cacheDatabase()
  try { return await new Promise<T>((resolve,reject)=>{
    const transaction=db.transaction(CACHE_STORE,mode),request=action(transaction.objectStore(CACHE_STORE))
    let result:T
    request.onsuccess=()=>{result=request.result}
    transaction.oncomplete=()=>resolve(result)
    transaction.onerror=transaction.onabort=()=>reject(new Error('베이스 폰트를 저장하지 못했어요. 작업 파일을 보관해주세요.'))
  }) } finally {db.close()}
}
export const cacheBaseFont=(base:LoadedBaseFont)=>cacheOperation('readwrite',store=>store.put(base.buffer,base.id))
export const readCachedFont=(id:string)=>cacheOperation<ArrayBuffer | undefined>('readonly',store=>store.get(id))
export const clearCachedFonts=()=>cacheOperation('readwrite',store=>store.clear())

function checksum(bytes:Uint8Array):number {
  let sum=0
  for(let i=0;i<bytes.length;i+=4)sum=(sum+(((bytes[i]??0)*0x1000000)+((bytes[i+1]??0)<<16)+((bytes[i+2]??0)<<8)+(bytes[i+3]??0)))>>>0
  return sum
}
// Keep original layout tables byte-for-byte: glyph indices of untouched originals never move.
export function preserveLayoutTables(output:ArrayBuffer,original:ArrayBuffer):ArrayBuffer {
  const tables=new Map([...sfntTables(output)].map(([tag,bytes])=>[tag,bytes.slice()]))
  const originals=sfntTables(original)
  for(const tag of ['GPOS','GSUB','GDEF','kern','BASE','JSTF','MATH'])if(originals.has(tag))tables.set(tag,originals.get(tag)!.slice())
  const entries=[...tables].sort(([a],[b])=>a<b?-1:a>b?1:0),count=entries.length
  const size=12+count*16+entries.reduce((sum,[,bytes])=>sum+((bytes.length+3)&~3),0)
  const buffer=new ArrayBuffer(size),view=new DataView(buffer),bytes=new Uint8Array(buffer)
  view.setUint32(0,0x4f54544f);view.setUint16(4,count)
  const power=2**Math.floor(Math.log2(count));view.setUint16(6,power*16);view.setUint16(8,Math.log2(power));view.setUint16(10,count*16-power*16)
  let offset=12+count*16,head=0
  entries.forEach(([tag,table],index)=>{
    if(tag==='head'){new DataView(table.buffer,table.byteOffset,table.byteLength).setUint32(8,0);head=offset}
    bytes.set([...tag].map(char=>char.charCodeAt(0)),12+index*16)
    view.setUint32(16+index*16,checksum(table));view.setUint32(20+index*16,offset);view.setUint32(24+index*16,table.length)
    bytes.set(table,offset);offset+=(table.length+3)&~3
  })
  if(!head)throw new Error('폰트 헤더를 만들지 못했어요.')
  view.setUint32(head+8,(0xb1b0afba-checksum(bytes))>>>0)
  return buffer
}
export function renameFont(font:Font,familyName:string) {
  const style=font.getEnglishName('fontSubfamily') || 'Regular'
  const suffix=[...familyName].map(char=>char.codePointAt(0)!.toString(16)).join('').slice(0,40)
  const platforms=font.names as unknown as Record<string,Record<string,Record<string,string>>>
  platforms.unicode={...platforms.macintosh,...platforms.windows,...platforms.unicode}
  for(const names of Object.values(platforms)) {
    names.fontFamily={en:familyName};names.preferredFamily={en:familyName}
    names.fullName={en:`${familyName} ${style}`};names.postScriptName={en:`Geulgyeol-${suffix}`}
    names.uniqueID={en:`Geulgyeol-${suffix}-${Date.now()}`}
  }
}
export function scaleCustomPath(path:Path,advance:number,unitsPerEm:number):void {
  for(const command of path.commands) {
    if('x' in command)command.x*=advance/1000
    if('x1' in command)command.x1*=advance/1000
    if('x2' in command)command.x2*=advance/1000
    if('y' in command)command.y*=unitsPerEm/1000
    if('y1' in command)command.y1*=unitsPerEm/1000
    if('y2' in command)command.y2*=unitsPerEm/1000
  }
}
