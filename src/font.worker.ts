import { createFont, type Glyphs, type Settings } from './font'
import type { Components } from './hangul'
self.onmessage = async (event: MessageEvent<{ glyphs: Glyphs; components: Components; settings: Settings; name: string }>) => {
  const { glyphs, components, settings, name } = event.data
  try {
    const buffer = await createFont(glyphs, settings, name, components, (completed, total) => self.postMessage({ type: 'progress', completed, total }))
    self.postMessage({ type: 'done', buffer }, { transfer: [buffer] })
  } catch {
    self.postMessage({ type: 'error' })
  }
}
