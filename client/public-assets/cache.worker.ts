/// <reference lib="webworker" />

const CACHE_NAME = 'open-agricola-public-assets-v1'
const CACHEABLE_PATH = /\.(?:jpg|jpeg|png|webp|woff2?|ttf)$/

type PublicAssetWorkerConfig = {
  baseUrl: string
  digests: Readonly<Record<string, string>>
}

type Asset = {
  url: string
  cacheKey: string
  digest: string
}

type AssetResponse = {
  response: Response
  stored?: Promise<void>
}

async function isMainWindow(scope: ServiceWorkerGlobalScope, clientId: string): Promise<boolean> {
  try {
    const client = await scope.clients.get(clientId)
    if (client?.type !== 'window' || (client.frameType !== 'top-level' && client.frameType !== 'auxiliary')) {
      return false
    }
    const url = new URL(client.url)
    return url.origin === scope.location.origin && (url.pathname === '/' || url.pathname === '/index.html')
  } catch {
    return false
  }
}

async function storeIfVerified(
  scope: ServiceWorkerGlobalScope,
  cache: Cache,
  asset: Asset,
  response: Response,
): Promise<void> {
  try {
    const bytes = await response.clone().arrayBuffer()
    const hash = new Uint8Array(await scope.crypto.subtle.digest('SHA-256', bytes))
    const digest = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')
    if (digest === asset.digest) await cache.put(asset.cacheKey, response)
  } catch {
    // Storage, hashing or a failed read must not invalidate the network response.
    void response.body?.cancel().catch(() => undefined)
    return
  }
  if (!response.bodyUsed) void response.body?.cancel().catch(() => undefined)
}

async function loadAsset(scope: ServiceWorkerGlobalScope, event: FetchEvent, asset: Asset): Promise<AssetResponse> {
  const { request } = event
  if (!await isMainWindow(scope, event.clientId)) return { response: await scope.fetch(request) }

  let cache: Cache
  try {
    cache = await scope.caches.open(CACHE_NAME)
    const cached = await cache.match(asset.cacheKey)
    if (cached) return { response: cached }
  } catch {
    return { response: await scope.fetch(request) }
  }

  let response: Response
  try {
    response = await scope.fetch(asset.url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
      redirect: 'error',
    })
  } catch {
    // An image may still be usable with its original request if CORS is unavailable.
    return { response: await scope.fetch(request) }
  }
  if (response.status !== 200) return { response }
  return { response, stored: storeIfVerified(scope, cache, asset, response.clone()) }
}

export function installPublicAssetWorker(scope: ServiceWorkerGlobalScope, config: PublicAssetWorkerConfig): void {
  const assets = new Map<string, Asset>()
  for (const [path, digest] of Object.entries(config.digests)) {
    if (!CACHEABLE_PATH.test(path)) continue
    const url = new URL(path, config.baseUrl).href
    assets.set(url, { url, digest, cacheKey: `${url}?__oa_sha256=${digest}` })
  }

  scope.addEventListener('fetch', event => {
    const { request } = event
    if (
      request.method !== 'GET'
      || (request.destination !== 'image' && request.destination !== 'font')
      || request.mode === 'same-origin'
      || (request.mode === 'cors' && request.credentials === 'include')
      || request.headers.has('range')
      || !event.clientId
    ) return
    const asset = assets.get(request.url)
    if (!asset) return

    const result = loadAsset(scope, event, asset)
    event.respondWith(result.then(({ response }) => response))
    event.waitUntil(result.then(({ stored }) => stored).catch(() => undefined))
  })

  scope.addEventListener('activate', event => {
    const retained = new Set(Array.from(assets.values(), asset => asset.cacheKey))
    event.waitUntil(scope.caches.open(CACHE_NAME).then(async cache => {
      const keys = await cache.keys()
      await Promise.all(keys.filter(key => !retained.has(key.url)).map(stale => cache.delete(stale)))
    }).catch(() => undefined))
  })
}
