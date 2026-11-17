import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import opentype from 'opentype.js'
import { BRUSHES, BRUSH_SAMPLE, strokeContours, restyleStroke } from '../src/brushes'
import { PART_SLOTS, guideStrokes } from '../src/hangul'
import { glyphTransform, parseProject, strokePath } from '../src/font'

async function line(page: Page) {
  const pad=page.locator('.writing-pad'); await pad.scrollIntoViewIfNeeded()
  const box=(await pad.boundingBox())!
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5)
  await page.mouse.down()
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:35})
  await page.mouse.up()
}

test('brush selection preserves old strokes, restyling can be undone, and JSON retains tools', async({page})=>{
  await page.goto('/')
  await line(page)
  const first=await page.locator('.ink path').first().getAttribute('d')
  await page.getByRole('radio',{name:'가는 펜',exact:true}).click()
  await expect(page.locator('.ink path').first()).toHaveAttribute('d',first!)
  await line(page)
  await expect(page.locator('.ink path')).toHaveCount(2)
  const height=await page.locator('.ink path').evaluateAll(nodes=>nodes.map(node=>(node as SVGPathElement).getBBox().height))
  expect(height[1]!).toBeLessThan(height[0]!*.7)
  await page.getByRole('radio',{name:'연필',exact:true}).click()
  await page.getByRole('button',{name:'현재 글자의 획에 적용 ↗'}).click()
  expect(await page.locator('.ink path').first().getAttribute('d')).not.toBe(first)
  await page.getByRole('button',{name:'도구 적용 취소'}).click()
  await expect(page.locator('.ink path').first()).toHaveAttribute('d',first!)
  await expect(page.locator('.save-state')).toContainText('저장됨')
  await page.reload()
  await expect(page.getByRole('radio',{name:'연필',exact:true})).toHaveAttribute('aria-checked','true')
  await expect(page.locator('.ink path').first()).toHaveAttribute('d',first!)
  const pending=page.waitForEvent('download')
  await page.getByRole('button',{name:'작업 파일로 안전하게 보관하기 ↗'}).click()
  const buffer=await readFile((await(await pending).path())!)
  const project=JSON.parse(buffer.toString())
  expect(project.version).toBe(4)
  expect(project.glyphs['안'].map((stroke:{brush:string})=>stroke.brush)).toEqual(['pen','fineliner'])
  await page.addInitScript(()=>localStorage.clear());await page.reload()
  await page.getByLabel('글결 작업 파일 불러오기').setInputFiles({name:'brushes.json',mimeType:'application/json',buffer})
  await expect(page.locator('.ink path').first()).toHaveAttribute('d',first!)
  await expect(page.locator('.ink path')).toHaveCount(2)
  await page.getByRole('radio',{name:'연필',exact:true}).focus()
  await page.getByRole('radio',{name:'연필',exact:true}).press('ArrowRight')
  await expect(page.getByRole('radio',{name:'붓펜',exact:true})).toBeFocused()
  await expect(page.getByRole('radio',{name:'붓펜',exact:true})).toHaveAttribute('aria-checked','true')
  await expect(page.getByRole('heading',{name:'‘안’을 써주세요.'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('all vector brushes export and pencil pores stay transparent in the actual font',async({page})=>{
  const points=Array.from({length:65},(_,i)=>[150+i*200/64,250,.5] as [number,number,number])
  const chars=[...'가나다라마']
  const glyphs=Object.fromEntries(BRUSHES.map((brush,i)=>[chars[i]!,[{points,brush:brush.id}]]))
  const fixture={version:3,components:{},glyphs,characters:chars,settings:{thickness:18,scale:1,spacing:0,brush:'pencil'},preview:chars.join(''),name:'도구 테스트',mode:'direct'}
  await page.addInitScript(project=>localStorage.setItem('geulgyeol.project.v3',JSON.stringify(project)),fixture)
  await page.goto('/')
  await expect(page.locator('.preview-glyph')).toHaveCount(5)
  const shapes=await page.locator('.preview-glyph path').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('d')))
  expect(new Set(shapes).size).toBe(5)
  await page.getByRole('button',{name:'글꼴 내보내기'}).click()
  const pending=page.waitForEvent('download')
  await page.getByRole('button',{name:'OTF 글꼴 다운로드 ↓'}).click()
  const data=await readFile((await(await pending).path())!)
  const font=opentype.parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer)
  expect(font.numGlyphs).toBe(7)
  for(const char of chars)expect(font.charToGlyphIndex(char)).toBeGreaterThan(0)
  const holes=strokeContours({points,brush:'pencil'},18).filter(contour=>contour.hole)
  expect(holes.length).toBeGreaterThan(0)
  expect(font.charToGlyph('다').path.commands.filter(command=>command.type==='M').length).toBe(holes.length+1)
  const transform=glyphTransform(1)
  const centers=holes.map(contour=>{
    const x=contour.points.reduce((sum,p)=>sum+p[0]!,0)/contour.points.length
    const y=contour.points.reduce((sum,p)=>sum+p[1]!,0)/contour.points.length
    return [(x*transform.factor+transform.x)*2,200+(y*transform.factor+transform.y)*2]
  })
  const rendered=await page.evaluate(async({base64,centers})=>{
    const face=new FontFace('BrushExport',Uint8Array.from(atob(base64),c=>c.charCodeAt(0)))
    await face.load();document.fonts.add(face)
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1400
    const context=canvas.getContext('2d')!;context.font='1000px BrushExport';context.textBaseline='alphabetic';context.fillText('다',0,1000)
    return {status:face.status,pores:centers.map(([x,y])=>context.getImageData(Math.round(x!),Math.round(y!),1,1).data[3]),ink:context.getImageData(Math.round(centers[0]![0]!),Math.round(centers[0]![1]!+10),1,1).data[3]}
  },{base64:data.toString('base64'),centers})
  expect(rendered.status).toBe('loaded')
  expect(rendered.pores.every(alpha=>alpha===0)).toBe(true)
  expect(rendered.ink).toBeGreaterThan(200)
})

test('taps and stylus pressure produce finite, distinct brush shapes',async({},info)=>{
  test.skip(info.project.name==='mobile','Pure geometry needs one run.')
  for(const brush of BRUSHES){
    for(const points of [[[250,250,.5]],BRUSH_SAMPLE]){
      const contours=strokeContours({points:points as [number,number,number][],brush:brush.id},13)
      expect(contours[0]!.points.length).toBeGreaterThan(2)
      expect(contours.flatMap(contour=>contour.points.flat()).every(Number.isFinite)).toBe(true)
    }
  }
  const legacy = { version:2, glyphs:{'안':[BRUSH_SAMPLE]}, components:{'initial:0:0':[BRUSH_SAMPLE]}, characters:['안'], settings:{thickness:13,scale:1,spacing:0}, preview:'안', name:'Old' }
  const migrated = parseProject(JSON.stringify(legacy))
  expect(migrated.version).toBe(4)
  expect(strokePath(migrated.glyphs['안']![0]!,13)).toBe(strokePath(BRUSH_SAMPLE,13))
  expect(strokePath(migrated.components['initial:0:0']![0]!,13)).toBe(strokePath(BRUSH_SAMPLE,13))
  expect(()=>parseProject(JSON.stringify({...legacy,version:3,glyphs:{'안':[{points:BRUSH_SAMPLE,brush:'unknown'}]}}))).toThrow()
  const low=BRUSH_SAMPLE.map(([x,y])=>[x,y,.15] as [number,number,number])
  const high=BRUSH_SAMPLE.map(([x,y])=>[x,y,.9] as [number,number,number])
  expect(strokeContours({points:low,brush:'brush'},13)).not.toEqual(strokeContours({points:high,brush:'brush'},13))
})

test('a full pencil Hangul font remains exportable',async({page},info)=>{
  test.skip(info.project.name==='mobile','Full-font benchmark runs once.')
  test.setTimeout(120_000)
  const fixture={version:3,components:Object.fromEntries(PART_SLOTS.map(slot=>[slot.id,guideStrokes(slot).map(stroke=>restyleStroke(stroke,'pencil'))])),glyphs:{},characters:['가'],settings:{thickness:13,scale:1,spacing:0,brush:'pencil'},preview:'가 각 곽 힣',name:'연필 한글',mode:'compose'}
  await page.addInitScript(project=>localStorage.setItem('geulgyeol.project.v3',JSON.stringify(project)),fixture)
  await page.goto('/')
  await expect(page.locator('.coverage-note')).toContainText('11,172')
  await page.getByRole('button',{name:'글꼴 내보내기'}).click()
  const pending=page.waitForEvent('download',{timeout:100_000})
  await page.getByRole('button',{name:'OTF 글꼴 다운로드 ↓'}).click()
  const data=await readFile((await(await pending).path())!)
  expect(data.byteLength).toBeLessThan(30*1024*1024)
  const font=opentype.parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer)
  expect(font.numGlyphs).toBe(11174)
  expect(font.charToGlyphIndex('힣')).toBeGreaterThan(0)
  const status=await page.evaluate(async base64=>{const face=new FontFace('FullPencil',Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));await face.load();return face.status},data.toString('base64'))
  expect(status).toBe('loaded')
  console.log(`Full pencil Hangul font: ${(data.byteLength/1024/1024).toFixed(2)} MiB`)
})

test('reset requires confirmation, allows a backup, and prevents legacy work from returning',async({page})=>{
  await page.goto('/')
  await page.getByRole('radio',{name:'붓펜',exact:true}).click()
  await line(page)
  await page.getByRole('tab',{name:/자소 조합/}).click()
  await line(page)
  await page.getByRole('tab',{name:/직접 쓰기/}).click()
  await expect(page.locator('.save-state')).toContainText('저장됨')
  await page.evaluate(()=>{
    localStorage.setItem('geulgyeol.project.v1','old version 1 backup')
    localStorage.setItem('geulgyeol.project.v2','old version 2 backup')
    localStorage.setItem('unrelated-preference','keep')
  })
  await page.getByRole('button',{name:'초기화',exact:true}).click()
  await expect(page.getByRole('dialog')).toContainText('직접 쓴 글자 1개')
  await expect(page.getByRole('dialog')).toContainText('모은 자소 1개')
  await page.getByRole('button',{name:'계속 작업하기'}).click()
  await expect(page.locator('.ink path')).toHaveCount(1)
  await page.getByRole('tab',{name:/자소 조합/}).click()
  await page.getByRole('button',{name:'초기화',exact:true}).click()
  const pending=page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button',{name:'작업 파일 저장 ↓',exact:true}).click()
  const backup=JSON.parse((await readFile((await(await pending).path())!)).toString())
  expect(backup.glyphs['안'][0].brush).toBe('brush')
  expect(Object.keys(backup.components)).toHaveLength(1)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button',{name:'전체 작업 초기화',exact:true}).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('tab',{name:/직접 쓰기/})).toHaveAttribute('aria-selected','true')
  await expect(page.locator('.ink path')).toHaveCount(0)
  await expect(page.getByRole('radio',{name:'기본 펜',exact:true})).toHaveAttribute('aria-checked','true')
  await expect(page.locator('.save-state')).toContainText('저장됨')
  const state=await page.evaluate(()=>({old1:localStorage.getItem('geulgyeol.project.v1'),old2:localStorage.getItem('geulgyeol.project.v2'),current:JSON.parse(localStorage.getItem('geulgyeol.project.v4')!),other:localStorage.getItem('unrelated-preference')}))
  expect(state.old1).toBeNull();expect(state.old2).toBeNull();expect(state.other).toBe('keep')
  expect(state.current.glyphs).toEqual({});expect(state.current.components).toEqual({})
  expect(state.current.settings).toMatchObject({brush:'pen',thickness:13,scale:1,spacing:0})
  await page.reload()
  await expect(page.locator('.ink path')).toHaveCount(0)
  await expect(page.locator('.coverage-note')).toContainText('0개')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
