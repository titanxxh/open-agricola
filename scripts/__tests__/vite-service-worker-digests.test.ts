import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Rolldown } from 'vite'
import { appShellDigests } from '../vite-service-worker'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function publicDir(encyclopedia: unknown = { catalog: { file: 'catalog.0123456789abcdef.json' }, search: { file: 'search.fedcba9876543210.json' } }) {
  const root = mkdtempSync(join(tmpdir(), 'oa-app-shell-digests-')); roots.push(root)
  mkdirSync(join(root, 'i18n')); mkdirSync(join(root, 'card-encyclopedia'))
  const files: Record<string, string> = {
    'i18n/zh.0123456789abcdef.json': '{"zh":1}', 'i18n/manifest.json': '{}',
    [`cards-manifest.${'a'.repeat(64)}.json`]: '{"cards":1}', 'cards-manifest.json': '{"cards":1}',
    'card-encyclopedia/catalog.0123456789abcdef.json': '{"catalog":1}', 'card-encyclopedia/search.fedcba9876543210.json': '{"search":1}',
    'card-encyclopedia/catalog.1111111111111111.json': '{"stale":1}', 'card-encyclopedia/manifest.json': JSON.stringify(encyclopedia),
  }
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text)
  return root
}
const bundle = { a: { type: 'chunk', fileName: 'assets/App-1.js', code: 'app' } } as unknown as Rolldown.OutputBundle

describe('files the Pages Worker serves cache-first', () => {
  it('lists bundled assets and the content-named data files of this build only', () => {
    expect(appShellDigests(bundle, publicDir())).toEqual({
      'assets/App-1.js': sha256('app'),
      'i18n/zh.0123456789abcdef.json': sha256('{"zh":1}'),
      [`cards-manifest.${'a'.repeat(64)}.json`]: sha256('{"cards":1}'),
      'card-encyclopedia/catalog.0123456789abcdef.json': sha256('{"catalog":1}'),
      'card-encyclopedia/search.fedcba9876543210.json': sha256('{"search":1}'),
    })
  })

  it('fails the build when the encyclopedia manifest names an unexpected file', () => {
    expect(() => appShellDigests(bundle, publicDir({ catalog: { file: '../sw.js' }, search: { file: 'search.fedcba9876543210.json' } })))
      .toThrow('Invalid encyclopedia catalog file')
  })
})
