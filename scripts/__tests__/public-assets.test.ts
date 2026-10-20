import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LOCAL_PUBLIC_ASSET_BASE_URL,
  loadPublicAssetConfig,
  publicAssetBaseUrl,
  rewriteCssPublicAssetUrls,
} from '../public-assets'

const VERSION = '452535ad419b8ea546ef73d9a410847bfae08e25'
const REQUIRED_FILES = ['assets/a.png', 'assets/b.webp']
const tempDirs: string[] = []

const createContract = async (files = REQUIRED_FILES): Promise<string> => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'open-agricola-public-assets-'))
  tempDirs.push(rootDir)
  await writeFile(path.join(rootDir, 'public-assets.ref'), `${VERSION}\n`)
  await writeFile(
    path.join(rootDir, 'public-assets.required.json'),
    JSON.stringify({ files }),
  )
  return rootDir
}

const inventoryFetcher = (
  files = [...REQUIRED_FILES, 'assets/z.jpg'],
  version = VERSION,
) => vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(async (input) =>
  new Response(new URL(input).pathname.endsWith('/asset-version.txt')
    ? `${version}\n`
    : JSON.stringify({ version, files })),
)

const createAssetCheckout = async (files = REQUIRED_FILES) => {
  const rootDir = await createContract()
  const directory = path.join(rootDir, 'checkout')
  await mkdir(path.join(directory, 'assets'), { recursive: true })
  await Promise.all(files.map(file => writeFile(path.join(directory, file), file)))
  const git = (...args: string[]): string => execFileSync('git', [
    '-C', directory, '-c', 'user.name=Public asset test', '-c', 'user.email=assets@example.test',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--quiet')
  git('add', 'assets')
  git('commit', '--quiet', '-m', 'Asset fixture')
  const version = git('rev-parse', 'HEAD')
  await writeFile(path.join(rootDir, 'public-assets.ref'), `${version}\n`)
  return { rootDir, directory, version }
}

describe('public asset contract', () => {
  beforeEach(() => { vi.stubEnv('PUBLIC_ASSET_VALIDATION_DIR', undefined) })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('validates deployed Pages metadata without sending GitHub credentials', async () => {
    const rootDir = await createContract()
    const fetcher = inventoryFetcher()
    const baseUrl = publicAssetBaseUrl()

    await expect(loadPublicAssetConfig({
      rootDir,
      env: { GH_TOKEN: 'test-token' },
      fetcher,
    })).resolves.toEqual({
      baseUrl,
      version: VERSION,
      requiredFiles: REQUIRED_FILES,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
      '/open-agricola-assets/asset-version.txt',
      '/open-agricola-assets/asset-manifest.json',
    ])
    for (const [input, init] of fetcher.mock.calls) {
      expect(new URL(input).origin).toBe('https://titanxxh.github.io')
      expect(new URL(input).searchParams.get('v')).toBe(VERSION)
      expect(init?.cache).toBe('no-store')
      expect(init?.headers).toEqual({ 'cache-control': 'no-cache' })
    }
  })

  it('fails closed when the deployed manifest omits a required asset', async () => {
    const rootDir = await createContract()

    await expect(
      loadPublicAssetConfig({ rootDir, fetcher: inventoryFetcher(['assets/a.png']) }),
    ).rejects.toThrow('missing required file: assets/b.webp')
  })

  it('validates a pinned clean local checkout without contacting Pages or changing build URLs', async () => {
    const { rootDir, directory, version } = await createAssetCheckout()
    const fetcher = vi.fn(() => Promise.reject(new Error('unexpected fetch')))
    await expect(loadPublicAssetConfig({
      rootDir, env: { PUBLIC_ASSET_VALIDATION_DIR: directory }, fetcher, allowLocal: false,
    })).resolves.toEqual({ baseUrl: publicAssetBaseUrl(), version, requiredFiles: REQUIRED_FILES })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a local checkout at a different commit', async () => {
    const { rootDir, directory } = await createAssetCheckout()
    await writeFile(path.join(rootDir, 'public-assets.ref'), `${VERSION}\n`)
    await expect(loadPublicAssetConfig({
      rootDir, env: { PUBLIC_ASSET_VALIDATION_DIR: directory },
    })).rejects.toThrow('checkout version does not match')
  })

  it.each(['modified', 'missing', 'untracked'] as const)('rejects %s assets in the local checkout', async mode => {
    const { rootDir, directory } = await createAssetCheckout()
    if (mode === 'missing') await rm(path.join(directory, 'assets/a.png'))
    else await writeFile(path.join(directory, mode === 'modified' ? 'assets/a.png' : 'assets/new.png'), 'changed')
    await expect(loadPublicAssetConfig({
      rootDir, env: { PUBLIC_ASSET_VALIDATION_DIR: directory },
    })).rejects.toThrow('checkout assets must be clean')
  })

  it('rejects required files absent from the pinned local inventory', async () => {
    const { rootDir, directory } = await createAssetCheckout(['assets/a.png'])
    await expect(loadPublicAssetConfig({
      rootDir, env: { PUBLIC_ASSET_VALIDATION_DIR: directory },
    })).rejects.toThrow('checkout is missing required file: assets/b.webp')
  })

  it('rejects a different Pages deployment version', async () => {
    const rootDir = await createContract()
    const fetcher = inventoryFetcher(REQUIRED_FILES, '0'.repeat(40))

    await expect(loadPublicAssetConfig({ rootDir, fetcher }))
      .rejects.toThrow('Pages version does not match')
  })

  it('rejects an inconsistent manifest version even when the version marker matches', async () => {
    const rootDir = await createContract()
    const fetcher = inventoryFetcher()
      .mockResolvedValueOnce(new Response(`${VERSION}\n`))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: '0'.repeat(40), files: REQUIRED_FILES,
      })))

    await expect(loadPublicAssetConfig({ rootDir, fetcher }))
      .rejects.toThrow('manifest version does not match')
  })

  it.each([
    [{ version: VERSION, files: ['assets/../a.png'] }, 'invalid path'],
    [{ version: VERSION, files: ['assets/a.png', 'assets/a.png'] }, 'duplicate paths'],
    [{ version: VERSION, files: ['assets/b.webp', 'assets/a.png'] }, 'must be sorted'],
    [{ version: VERSION, files: REQUIRED_FILES, unexpected: true }, 'Invalid public asset manifest'],
  ])('rejects malformed deployed manifests', async (manifest, message) => {
    const rootDir = await createContract()
    const fetcher = inventoryFetcher()
      .mockResolvedValueOnce(new Response(`${VERSION}\n`))
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))

    await expect(loadPublicAssetConfig({ rootDir, fetcher })).rejects.toThrow(message)
  })

  it('rejects invalid JSON and unavailable Pages metadata', async () => {
    const rootDir = await createContract()
    const fetcher = inventoryFetcher()
      .mockResolvedValueOnce(new Response(`${VERSION}\n`))
      .mockResolvedValueOnce(new Response('<html>Not a manifest</html>'))
    await expect(loadPublicAssetConfig({ rootDir, fetcher }))
      .rejects.toThrow('Invalid public asset manifest JSON')

    fetcher.mockResolvedValue(new Response('Not Found', { status: 404 }))
    await expect(loadPublicAssetConfig({ rootDir, fetcher })).rejects.toThrow('returned 404')
  })

  it.each([
    [['assets/a.png', 'assets/a.png'], 'duplicate paths'],
    [['assets/../a.png'], 'invalid path'],
    [['assets/b.webp', 'assets/a.png'], 'must be sorted'],
  ])('rejects invalid required file lists', async (files, message) => {
    const rootDir = await createContract(files)

    await expect(loadPublicAssetConfig({
      rootDir,
      fetcher: inventoryFetcher(),
    })).rejects.toThrow(message)
  })

  it('keeps Vitest-style config loading network-free', async () => {
    const rootDir = await createContract()
    const fetcher = vi.fn(() => Promise.reject(new Error('unexpected fetch')))

    await expect(loadPublicAssetConfig({
      rootDir,
      fetcher,
      validateRemote: false,
    })).resolves.toEqual({
      baseUrl: publicAssetBaseUrl(),
      version: VERSION,
      requiredFiles: REQUIRED_FILES,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses a complete local source without contacting the remote host', async () => {
    const rootDir = await createContract()
    const localDir = path.join(rootDir, 'local')
    const fetcher = vi.fn(() => Promise.reject(new Error('unexpected fetch')))
    await mkdir(path.join(localDir, 'assets'), { recursive: true })
    await Promise.all(REQUIRED_FILES.map(file => writeFile(path.join(localDir, file), file)))

    await expect(loadPublicAssetConfig({
      rootDir,
      env: { PUBLIC_ASSET_LOCAL_DIR: localDir },
      fetcher,
    })).resolves.toEqual({
      baseUrl: LOCAL_PUBLIC_ASSET_BASE_URL,
      version: VERSION,
      requiredFiles: REQUIRED_FILES,
      localDir,
    })
    expect(fetcher).not.toHaveBeenCalled()

    await expect(loadPublicAssetConfig({
      rootDir,
      env: { PUBLIC_ASSET_LOCAL_DIR: localDir },
      fetcher,
      allowLocal: false,
    })).rejects.toThrow('only supported by the local development server')

    await rm(path.join(localDir, REQUIRED_FILES[1]!))
    await expect(loadPublicAssetConfig({
      rootDir,
      env: { PUBLIC_ASSET_LOCAL_DIR: localDir },
      fetcher,
    })).rejects.toThrow(`missing required file: ${REQUIRED_FILES[1]}`)
  })

  it('rewrites CSS asset URLs through the pinned source', () => {
    const baseUrl = publicAssetBaseUrl()
    expect(rewriteCssPublicAssetUrls(
      "background: url('/assets/a.png')",
      '/',
      { baseUrl, version: VERSION },
    )).toBe(`background: url('${baseUrl}assets/a.png?v=${VERSION}')`)
  })
})
