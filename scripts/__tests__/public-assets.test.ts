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
) => vi.fn(async () => new Response(JSON.stringify({
  truncated: false,
  tree: files.map(file => ({ path: file, type: 'blob' })),
})))

describe('public asset contract', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('validates the pinned commit tree and returns a commit-addressed base URL', async () => {
    const rootDir = await createContract()
    const fetcher = inventoryFetcher()
    const baseUrl = publicAssetBaseUrl(VERSION)

    await expect(loadPublicAssetConfig({
      rootDir,
      env: { GH_TOKEN: 'test-token' },
      fetcher,
    })).resolves.toEqual({
      baseUrl,
      version: VERSION,
      requiredFiles: REQUIRED_FILES,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [input, init] = fetcher.mock.calls[0]!
    expect(new URL(input).pathname).toBe(
      `/repos/titanxxh/open-agricola-assets/git/trees/${VERSION}`,
    )
    expect(new URL(input).searchParams.get('recursive')).toBe('1')
    expect(init?.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer test-token',
      'X-GitHub-Api-Version': '2022-11-28',
    })
  })

  it('fails closed when the pinned commit omits a required asset', async () => {
    const rootDir = await createContract()

    await expect(
      loadPublicAssetConfig({ rootDir, fetcher: inventoryFetcher(['assets/a.png']) }),
    ).rejects.toThrow('missing required file: assets/b.webp')
  })

  it('rejects a truncated pinned commit tree', async () => {
    const rootDir = await createContract()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      truncated: true,
      tree: REQUIRED_FILES.map(file => ({ path: file, type: 'blob' })),
    })))

    await expect(loadPublicAssetConfig({ rootDir, fetcher }))
      .rejects.toThrow('must contain a complete tree')
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
      baseUrl: publicAssetBaseUrl(VERSION),
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
    const baseUrl = publicAssetBaseUrl(VERSION)
    expect(rewriteCssPublicAssetUrls(
      "background: url('/assets/a.png')",
      '/',
      { baseUrl, version: VERSION },
    )).toBe(`background: url('${baseUrl}assets/a.png?v=${VERSION}')`)
  })
})
