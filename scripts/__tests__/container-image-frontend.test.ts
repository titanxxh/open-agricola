import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { afterEach, expect, it, vi } from 'vitest'

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

it.each([
  { supplied: 'stable', expected: 'stable' },
  { supplied: 'prerelease', expected: 'prerelease' },
  { supplied: undefined, expected: 'stable' },
])('compiles the image SHA and $expected channel from actual build arguments', async ({ supplied, expected }) => {
  const root = mkdtempSync(join(tmpdir(), 'oa-image-browser-metadata-')); roots.push(root)
  const sourceSha = 'c'.repeat(40)
  vi.stubEnv('GAME_BUILD_ID', sourceSha); vi.stubEnv('RELEASE_CHANNEL', supplied)
  vi.stubEnv('VITE_GAME_BUILD_ID', undefined); vi.stubEnv('VITE_RELEASE_CHANNEL', undefined)
  writeFileSync(join(root, 'index.html'), '<!doctype html><script type="module" src="/entry.ts"></script>')
  writeFileSync(join(root, 'entry.ts'), 'globalThis.__imageBuild = { build: import.meta.env.VITE_GAME_BUILD_ID, channel: import.meta.env.VITE_RELEASE_CHANNEL }\n')
  const output = join(root, 'dist')
  await build({ configFile: resolve('vite.config.ts'), root, publicDir: false, cacheDir: join(root, '.cache'), logLevel: 'silent',
    build: { outDir: output, modulePreload: false, rolldownOptions: { input: join(root, 'index.html') } },
  })
  const assets = readdirSync(join(output, 'assets')).filter(file => file.endsWith('.js'))
  expect(assets).toHaveLength(1)
  const sandbox: { __imageBuild?: unknown } = {}
  runInNewContext(readFileSync(join(output, 'assets', assets[0]!), 'utf8'), sandbox, { timeout: 1000 })
  expect(sandbox.__imageBuild).toEqual({ build: sourceSha, channel: expected })
}, 30000)
