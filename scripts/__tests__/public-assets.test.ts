import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('public asset contract', () => {
  afterEach(async () => {
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
