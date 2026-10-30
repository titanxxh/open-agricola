import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  CardEncyclopediaCatalogFile,
  CardEncyclopediaFileRef,
  CardEncyclopediaManifest,
  CardEncyclopediaSearchFile,
  EncyclopediaEntry,
  EncyclopediaSearchDocument,
} from '../../shared/contract/card-encyclopedia'

const HASHED_FILE = /^(catalog|search)\.[a-f0-9]{16}\.json$/

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const publish = (path: string, content: string) => {
  try {
    if (readFileSync(path, 'utf8') === content) return
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content, { flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

const publishHashed = (outputDir: string, name: string, value: unknown): CardEncyclopediaFileRef => {
  const text = `${JSON.stringify(value)}\n`
  const digest = sha256(text)
  const file = `${name}.${digest.slice(0, 16)}.json`
  publish(resolve(outputDir, file), text)
  return { file, sha256: digest }
}

export type CardEncyclopediaArtifacts = {
  readonly outputDir: string
  readonly entries: readonly EncyclopediaEntry[]
  readonly documents: readonly EncyclopediaSearchDocument[]
  readonly languages: readonly string[]
}

/** Content-addressed catalog and search files plus a small always-revalidated manifest. */
export const writeCardEncyclopedia = ({ outputDir, entries, documents, languages }: CardEncyclopediaArtifacts): CardEncyclopediaManifest => {
  entries.forEach((entry, index) => {
    if (documents[index]?.key !== entry.key) throw new Error(`Search document out of step with catalog entry ${entry.key}`)
  })
  if (documents.length !== entries.length) throw new Error('Search documents do not match the catalog')
  mkdirSync(outputDir, { recursive: true })
  const catalog: CardEncyclopediaCatalogFile = { version: 1, entries }
  const search: CardEncyclopediaSearchFile = { version: 1, languages, documents }
  const manifest: CardEncyclopediaManifest = {
    version: 1,
    entryCount: entries.length,
    languages,
    catalog: publishHashed(outputDir, 'catalog', catalog),
    search: publishHashed(outputDir, 'search', search),
  }
  publish(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const current = new Set([manifest.catalog.file, manifest.search.file])
  for (const file of readdirSync(outputDir)) {
    if (HASHED_FILE.test(file) && !current.has(file)) rmSync(resolve(outputDir, file), { force: true })
  }
  return manifest
}
