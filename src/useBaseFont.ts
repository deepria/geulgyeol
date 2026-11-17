import { shallowRef, ref } from 'vue'
import { cacheBaseFont, clearCachedFonts, decodeFont, encodeFont, readBaseFont, readCachedFont, type BaseFontRecord, type LoadedBaseFont } from './base-font'

export function useBaseFont(notify:(message:string)=>void) {
  const base=shallowRef<LoadedBaseFont|null>(null)
  const record=ref<BaseFontRecord|undefined>()
  const loading=ref(false)
  async function activate(candidate:LoadedBaseFont) {
    try { await cacheBaseFont(candidate) }
    catch { notify('베이스 폰트를 이 기기에 저장하지 못했어요. 작업 파일을 꼭 저장해주세요.') }
    base.value=candidate;record.value={fileName:candidate.fileName,id:candidate.id}
  }
  async function candidateFromRecord(saved:BaseFontRecord,portable=false):Promise<LoadedBaseFont> {
    const buffer=saved.data ? decodeFont(saved.data) : portable ? undefined : await readCachedFont(saved.id)
    if(!buffer)throw new Error('베이스 폰트 파일을 다시 불러와주세요. 저장된 손글씨는 유지됩니다.')
    const candidate=await readBaseFont(buffer,saved.fileName)
    if(candidate.id!==saved.id)throw new Error('작업 파일의 베이스 폰트가 원본과 일치하지 않아요.')
    return candidate
  }
  async function restore(saved:BaseFontRecord|undefined) {
    base.value=null;record.value=saved
    if(!saved)return
    loading.value=true
    try { await activate(await candidateFromRecord(saved)) }
    finally { loading.value=false }
  }
  function snapshot(includeData:boolean):BaseFontRecord|undefined {
    if(!record.value)return undefined
    return {...record.value,...(includeData && base.value ? {data:encodeFont(base.value.buffer)} : {})}
  }
  async function remove() {
    try {await clearCachedFonts()} finally {base.value=null;record.value=undefined}
  }
  return {base,record,loading,activate,candidateFromRecord,restore,snapshot,remove}
}
