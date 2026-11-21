import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBrowserDataDefines } from '../browser-data'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const packSha256 = 'a'.repeat(64)
const languages = `${JSON.stringify({ version: 1, defaultLocale: 'zh', languages: [
  { id: 'zh', name: '简体中文', file: `zh.${packSha256.slice(0, 16)}.json`, sha256: packSha256, sourceSha256: packSha256 },
] }, null, 2)}\n`

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agricola-browser-data-'))
  roots.push(root)
  const raw = '{"A1":{"meta":{"id":"A1","name":"First card"}}}\n'
  const sha256 = createHash('sha256').update(raw).digest('hex')
  mkdirSync(join(root, 'public'))
  writeFileSync(join(root, 'public/cards-manifest.json'), raw)
  writeFileSync(join(root, `public/cards-manifest.${sha256}.json`), raw)
  mkdirSync(join(root, 'public/i18n'))
  writeFileSync(join(root, 'public/i18n/manifest.json'), languages)
  return { root, raw, sha256 }
}

describe('browser metadata build identity', () => {
  it('binds the browser to the complete bytes emitted by the cards generator', () => {
    const { root, raw, sha256 } = fixture()
    const defines = loadBrowserDataDefines(root)

    expect(defines).toEqual({
      'import.meta.env.VITE_CARDS_MANIFEST_SHA256': JSON.stringify(sha256),
      'import.meta.env.VITE_LANGUAGE_MANIFEST': JSON.stringify(languages),
    })
    const emittedHash: string = JSON.parse(defines['import.meta.env.VITE_CARDS_MANIFEST_SHA256'])
    const emitted = readFileSync(join(root, `public/cards-manifest.${emittedHash}.json`), 'utf8')
    expect(emitted).toBe(raw)
    expect(JSON.parse(emitted).A1.meta.name).toBe('First card')
  })

  it('refuses a missing content-named file instead of publishing an unusable URL', () => {
    const { root, sha256 } = fixture()
    rmSync(join(root, `public/cards-manifest.${sha256}.json`))
    expect(() => loadBrowserDataDefines(root)).toThrow(`cards-manifest.${sha256}.json`)
  })

  it('refuses a content-named file whose bytes differ from the canonical metadata', () => {
    const { root, sha256 } = fixture()
    writeFileSync(join(root, `public/cards-manifest.${sha256}.json`), '{}\n')
    expect(() => loadBrowserDataDefines(root)).toThrow('Cards manifest content mismatch')
  })

  it('carries the pinned language list so startup does not request it', () => {
    const { root } = fixture()
    const embedded: string = JSON.parse(loadBrowserDataDefines(root)['import.meta.env.VITE_LANGUAGE_MANIFEST'])
    expect(JSON.parse(embedded).languages[0].file).toBe(`zh.${packSha256.slice(0, 16)}.json`)
  })

  it('refuses a language list the client could not parse', () => {
    const { root } = fixture()
    writeFileSync(join(root, 'public/i18n/manifest.json'), '{"version":1,"languages":[]}\n')
    expect(() => loadBrowserDataDefines(root)).toThrow()
  })
})
