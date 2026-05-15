import {
  __resetCardsManifestCache,
  loadCardsManifest,
} from '../services/card-meta'

const nodeFs = 'node:fs'
const nodePath = 'node:path'
const fs = await import(nodeFs) as {
  existsSync(path: string | URL): boolean
  readFileSync(path: string | URL, encoding: 'utf8'): string
}
const path = await import(nodePath) as {
  resolve(...paths: string[]): string
}
const manifestPath = path.resolve('public/cards-manifest.json')

if (fs.existsSync(manifestPath)) {
  const raw = fs.readFileSync(manifestPath, 'utf8')
  const payload = JSON.parse(raw)
  const existingFetch =
    typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    if (url.endsWith('cards-manifest.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      } as unknown as Response
    }
    if (existingFetch) return existingFetch(input as never, init)
    throw new Error(`[test-setup] fetch(${url}) unmocked`)
  }) as typeof fetch
  __resetCardsManifestCache()
  await loadCardsManifest()
}
