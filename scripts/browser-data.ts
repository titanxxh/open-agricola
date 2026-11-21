import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLanguageManifest } from '../shared/i18n/index.ts'

export function cardsManifestAsset(content: string) {
  const sha256 = createHash('sha256').update(content).digest('hex')
  return { sha256, fileName: `cards-manifest.${sha256}.json` }
}

/**
 * `languageList` embeds the pinned language list for the main site, whose build fixes it. A Replay Viewer package
 * reads the list published inside its own package at runtime instead, so it never carries one.
 */
export function loadBrowserDataDefines(root: string, { languageList = false } = {}): Record<string, string> {
  const content = readFileSync(join(root, 'public/cards-manifest.json'), 'utf8')
  const { sha256, fileName } = cardsManifestAsset(content)
  if (readFileSync(join(root, 'public', fileName), 'utf8') !== content) {
    throw new Error(`Cards manifest content mismatch: ${fileName}`)
  }
  const defines: Record<string, string> = { 'import.meta.env.VITE_CARDS_MANIFEST_SHA256': JSON.stringify(sha256) }
  if (!languageList) return defines
  // The language list is fixed by the pinned packs, so the build carries it and startup skips one request.
  const languages = readFileSync(join(root, 'public/i18n/manifest.json'), 'utf8')
  parseLanguageManifest(JSON.parse(languages))
  return { ...defines, 'import.meta.env.VITE_LANGUAGE_MANIFEST': JSON.stringify(languages) }
}
