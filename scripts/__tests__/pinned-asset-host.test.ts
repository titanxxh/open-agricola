import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import type { TLSSocket } from 'node:tls'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FullConfig } from '@playwright/test'
import globalSetup, { PINNED_ASSET_HEADER, PINNED_ASSET_HOST_DECLINED, PINNED_ASSET_HOST_PORT, PINNED_ASSET_HOST_SPKI, ownLaunchOptions, pinnedAssetHostArgs, startPinnedAssetHost } from '../../e2e-tests/helpers/pinned-asset-host'

const roots: string[] = [], closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function checkout() {
  const root = mkdtempSync(join(tmpdir(), 'pinned-assets-')); roots.push(root)
  const repository = join(root, 'assets-repo')
  mkdirSync(join(repository, 'assets/revised/fonts'), { recursive: true })
  writeFileSync(join(repository, 'assets/revised/fonts/Dominican.woff2'), 'font bytes')
  writeFileSync(join(root, 'outside.txt'), 'secret')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
  git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'pin')
  return { repository, version: git('rev-parse', 'HEAD') }
}

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: string; pin: string }
function fetchPinned(port: number, path: string, method = 'GET'): Promise<Answer> {
  return new Promise((done, fail) => {
    const call = request({ host: '127.0.0.1', port, path, method, servername: 'titanxxh.github.io', rejectUnauthorized: false, agent: false }, response => {
      const pin = createHash('sha256').update((response.socket as TLSSocket).getPeerX509Certificate()!.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
      let body = ''
      response.setEncoding('utf8').on('data', chunk => { body += chunk }).on('end', () => done({ status: response.statusCode!, headers: response.headers, body, pin }))
    })
    call.on('error', fail).end()
  })
}

/** Each browser a spec launches itself, with the text of its options argument. */
function ownLaunches(): { site: string; options: string }[] {
  const root = join(import.meta.dirname, '../../e2e-tests'), sites: { site: string; options: string }[] = []
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.ts'))
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8')
    for (const match of text.matchAll(/\.(?:launch|launchPersistentContext)\(/g)) {
      let depth = 1, end = match.index + match[0].length
      while (depth && end < text.length) { if (text[end] === '(') depth++; else if (text[end] === ')') depth--; end++ }
      sites.push({ site: `${file}:${text.slice(0, match.index).split('\n').length}`, options: text.slice(match.index + match[0].length, end - 1) })
    }
  }
  return sites
}

describe('pinned asset host', () => {
  it('answers the asset site path from the checkout with Pages CORS, under the key Chromium is told to trust', async () => {
    const { repository, version } = checkout()
    const host = await startPinnedAssetHost(repository); closers.push(host.close)
    const font = await fetchPinned(host.port, '/open-agricola-assets/assets/revised/fonts/Dominican.woff2?v=abc')
    expect(font).toMatchObject({ status: 200, body: 'font bytes', pin: host.spki })
    expect(font.headers).toMatchObject({ 'content-type': 'font/woff2', 'content-length': '10', 'access-control-allow-origin': '*', [PINNED_ASSET_HEADER]: version })
    expect(await fetchPinned(host.port, '/open-agricola-assets/assets/revised/fonts/Dominican.woff2', 'HEAD')).toMatchObject({ status: 200, body: '' })
    // Nothing outside the checkout or the asset site's path, and only reads.
    for (const path of ['/open-agricola-assets/..%2Foutside.txt', '/open-agricola-assets/%2e%2e/outside.txt', '/outside.txt',
      '/open-agricola/index.html', '/open-agricola-assets/assets/missing.png', '/open-agricola-assets/assets']) {
      expect([path, (await fetchPinned(host.port, path)).status]).toEqual([path, 404])
    }
    expect((await fetchPinned(host.port, '/open-agricola-assets/assets/revised/fonts/Dominican.woff2', 'POST')).status).toBe(405)
  })

  it('makes every browser a spec launches itself pass its own arguments, since WebKit cannot inherit the mapping', () => {
    const launches = ownLaunches()
    expect(launches.length).toBeGreaterThan(0)
    expect(launches.filter(({ options }) => !/\bargs\b|ownLaunchOptions\(/.test(options)).map(({ site }) => site)).toEqual([])
    expect(ownLaunchOptions('chromium')).toEqual({})
    expect(ownLaunchOptions('webkit')).toEqual({ args: [] })
  })

  it('maps the asset host for Chromium only when a run exported its port and key pin', async () => {
    expect(pinnedAssetHostArgs({})).toEqual([])
    expect(pinnedAssetHostArgs({ [PINNED_ASSET_HOST_PORT]: '41234' })).toEqual([])
    expect(pinnedAssetHostArgs({ [PINNED_ASSET_HOST_PORT]: '41234', [PINNED_ASSET_HOST_SPKI]: 'pin=' }))
      .toEqual(['--host-resolver-rules=MAP titanxxh.github.io 127.0.0.1:41234', '--ignore-certificate-errors-spki-list=pin='])
    const { repository } = checkout()
    const config = (...browsers: (string | undefined)[]) => ({ projects: browsers.map(browserName => ({ use: browserName ? { browserName } : {} })) }) as unknown as FullConfig
    const keys = ['E2E_PUBLIC_ASSET_DIR', PINNED_ASSET_HOST_PORT, PINNED_ASSET_HOST_SPKI, PINNED_ASSET_HOST_DECLINED]
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
    try {
      for (const key of keys) delete process.env[key]
      expect(await globalSetup(config(undefined))).toBeUndefined()
      expect(process.env[PINNED_ASSET_HOST_DECLINED]).toBeUndefined()
      process.env.E2E_PUBLIC_ASSET_DIR = repository
      // Launch arguments are shared and WebKit refuses host mapping: WebKit-only and mixed runs keep the asset site,
      // and say why so the guard spec skips.
      for (const browsers of [['webkit'], ['chromium', 'firefox', 'webkit']]) {
        delete process.env[PINNED_ASSET_HOST_DECLINED]
        expect(await globalSetup(config(...browsers))).toBeUndefined()
        expect(process.env[PINNED_ASSET_HOST_PORT]).toBeUndefined()
        expect(process.env[PINNED_ASSET_HOST_DECLINED]).toMatch(/other than Chromium/)
      }
      delete process.env[PINNED_ASSET_HOST_DECLINED]
      const close = await globalSetup(config(undefined))
      expect(close).toBeTypeOf('function'); closers.push(close!)
      expect(process.env[PINNED_ASSET_HOST_PORT]).toMatch(/^\d+$/)
      expect((await fetchPinned(Number(process.env[PINNED_ASSET_HOST_PORT]), '/open-agricola-assets/assets/revised/fonts/Dominican.woff2')).pin)
        .toBe(process.env[PINNED_ASSET_HOST_SPKI])
      expect(process.env[PINNED_ASSET_HOST_DECLINED]).toBeUndefined()
    } finally {
      for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }
    }
  })
})
