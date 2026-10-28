import type { Page } from '@playwright/test'

export type VisibleReleaseAsset = { origin: string; path: string; width: number; height: number }

export async function verifyVisibleReleaseAssets(page: Page): Promise<VisibleReleaseAsset[]> {
  const decoding = page.evaluate(async () => {
    const urls = new Set<string>()
    const images = {
      add(value: string) {
        const url = new URL(value, document.baseURI)
        if (url.protocol === 'http:' || url.protocol === 'https:') urls.add(url.href)
      },
      fromCss(value: string) {
        for (const match of value.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)) {
          const value = match[1] ?? match[2] ?? match[3]
          if (value) images.add(value.trim())
        }
      },
    }
    for (const element of document.querySelectorAll('*')) {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element)
      if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth
        || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      let transparent = false
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        if (getComputedStyle(ancestor).opacity === '0') { transparent = true; break }
      }
      if (transparent) continue
      for (const pseudo of [null, '::before', '::after']) {
        const computed = getComputedStyle(element, pseudo)
        if (pseudo && (computed.content === 'none' || computed.content === 'normal')) continue
        if (computed.visibility === 'hidden' || computed.opacity === '0') continue
        images.fromCss(computed.backgroundImage)
        images.fromCss(computed.maskImage)
        images.fromCss(computed.getPropertyValue('-webkit-mask-image'))
      }
      if (element instanceof HTMLImageElement && (element.currentSrc || element.src)) images.add(element.currentSrc || element.src)
    }
    const [assets] = await Promise.all([
      Promise.all([...urls].map(async value => {
        const url = new URL(value), image = new Image()
        image.src = value
        try { await image.decode() }
        catch { throw new Error(`Visible release asset failed to decode: ${url.origin}${url.pathname}`) }
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error('Visible release asset has no decoded dimensions')
        return { origin: url.origin, path: url.pathname, width: image.naturalWidth, height: image.naturalHeight }
      })),
      document.fonts.ready,
    ])
    return assets
  })
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([decoding, new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Visible release assets/fonts exceeded 15 seconds')), 15_000)
    })])
  }
  finally { clearTimeout(deadline) }
}
