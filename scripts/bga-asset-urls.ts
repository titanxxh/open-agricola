import type { PluginOption } from 'vite'

export const DEFAULT_BGA_CDN_BASE_URL =
  'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img'

export const bgaAssetUrls = (cdnBaseUrl: string): PluginOption => {
  const needle = '/bga-img'
  const baseUrl = cdnBaseUrl.replace(/\/+$/, '')

  return {
    name: 'bga-asset-urls',
    apply: 'build',
    enforce: 'pre',
    transform(code: string) {
      if (!code.includes(needle)) return null
      return { code: code.replaceAll(needle, baseUrl), map: null }
    },
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>,
    ) {
      for (const file of Object.values(bundle)) {
        if (
          file.type !== 'asset'
          || !file.fileName.endsWith('.css')
          || typeof file.source !== 'string'
          || !file.source.includes(needle)
        ) continue
        file.source = file.source.replaceAll(needle, baseUrl)
      }
    },
  }
}
