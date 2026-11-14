import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function cardsManifestAsset(content: string) {
  const sha256 = createHash('sha256').update(content).digest('hex')
  return { sha256, fileName: `cards-manifest.${sha256}.json` }
}

export function loadBrowserDataDefines(root: string): Record<string, string> {
  const content = readFileSync(join(root, 'public/cards-manifest.json'), 'utf8')
  const { sha256, fileName } = cardsManifestAsset(content)
  if (readFileSync(join(root, 'public', fileName), 'utf8') !== content) {
    throw new Error(`Cards manifest content mismatch: ${fileName}`)
  }
  return { 'import.meta.env.VITE_CARDS_MANIFEST_SHA256': JSON.stringify(sha256) }
}
