import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { EncyclopediaEntry, EncyclopediaSearchDocument } from '../../shared/contract/card-encyclopedia'
import { writeCardEncyclopedia } from '../card-encyclopedia/artifacts'

const entry = (sourceId: string): EncyclopediaEntry => ({
  key: `season:${sourceId}`,
  sourceKind: 'season',
  sourceId,
  group: 'seasons',
  publicType: 'season',
  displayNumber: null,
  players: null,
  face: { kind: 'season', season: 'winter', actionId: 'season-winter-romantic-evening' },
  text: { name: [{ key: 'ui.seasons.winter' }], body: [{ literal: 'Body' }] },
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
})
const document = (sourceId: string): EncyclopediaSearchDocument => ({
  key: `season:${sourceId}`,
  identifiers: [sourceId],
  locales: { en: { name: { text: 'Winter', status: 'localized' } } },
  extraTerms: [],
})

const directories: string[] = []
const outputDir = () => {
  const directory = mkdtempSync(join(tmpdir(), 'card-encyclopedia-'))
  directories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const read = (directory: string, file: string) => readFileSync(join(directory, file), 'utf8')

describe('card encyclopedia artifacts', () => {
  it('names the catalog and search files by their content hash and lists them in the manifest', () => {
    const directory = outputDir()
    const manifest = writeCardEncyclopedia({ outputDir: directory, entries: [entry('winter')], documents: [document('winter')], languages: ['en', 'zh'] })
    const catalogText = read(directory, manifest.catalog.file)
    const searchText = read(directory, manifest.search.file)

    expect(manifest).toEqual({
      version: 1,
      entryCount: 1,
      languages: ['en', 'zh'],
      catalog: { file: `catalog.${sha256(catalogText).slice(0, 16)}.json`, sha256: sha256(catalogText) },
      search: { file: `search.${sha256(searchText).slice(0, 16)}.json`, sha256: sha256(searchText) },
    })
    expect(JSON.parse(read(directory, 'manifest.json'))).toEqual(manifest)
    expect(JSON.parse(catalogText)).toEqual({ version: 1, entries: [entry('winter')] })
    expect(JSON.parse(searchText)).toEqual({ version: 1, languages: ['en', 'zh'], documents: [document('winter')] })
  })

  it('writes identical bytes for identical input', () => {
    const first = outputDir()
    const second = outputDir()
    const input = { entries: [entry('winter')], documents: [document('winter')], languages: ['en'] }
    writeCardEncyclopedia({ outputDir: first, ...input })
    writeCardEncyclopedia({ outputDir: second, ...input })
    const files = readdirSync(first).sort()
    expect(readdirSync(second).sort()).toEqual(files)
    for (const file of files) expect(read(second, file)).toBe(read(first, file))
  })

  it('replaces superseded hashed files and leaves unrelated files alone', () => {
    const directory = outputDir()
    writeFileSync(join(directory, 'catalog.0000000000000000.json'), '{}')
    writeFileSync(join(directory, 'search.ffffffffffffffff.json'), '{}')
    writeFileSync(join(directory, 'README.txt'), 'keep')
    const before = writeCardEncyclopedia({ outputDir: directory, entries: [entry('winter')], documents: [document('winter')], languages: ['en'] })
    const after = writeCardEncyclopedia({ outputDir: directory, entries: [entry('spring')], documents: [document('spring')], languages: ['en'] })

    expect(after.catalog.file).not.toBe(before.catalog.file)
    expect(readdirSync(directory).sort()).toEqual(['README.txt', after.catalog.file, 'manifest.json', after.search.file].sort())
  })

  it('refuses search documents that do not line up with the catalog', () => {
    expect(() => writeCardEncyclopedia({
      outputDir: outputDir(),
      entries: [entry('winter'), entry('spring')],
      documents: [document('spring'), document('winter')],
      languages: ['en'],
    })).toThrow('season:winter')
  })
})
