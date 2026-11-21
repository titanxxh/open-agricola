/// <reference lib="webworker" />

const CACHE_NAME = 'open-agricola-app-shell-v1'

/** Site-relative paths of this build's content-addressed files, each with the SHA-256 of its bytes. */
export type AppShellDigests = Readonly<Record<string, string>>

export type AppShellConfig = Readonly<{
  digests: AppShellDigests
  /** Files of screens a visitor usually opens next (the game screen), cached in the background after a visit. */
  warm: readonly string[]
}>

/** Sent by a page after its first screen: the same-origin files it already downloaded. */
export const APP_SHELL_WARM_MESSAGE = 'open-agricola:app-shell-warm-v1'
const WARM_CONCURRENCY = 3

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function storeIfVerified(scope: ServiceWorkerGlobalScope, key: string, digest: string, response: Response) {
  try {
    const bytes = await response.clone().arrayBuffer()
    if (hex(await scope.crypto.subtle.digest('SHA-256', bytes)) !== digest) return
    const cache = await scope.caches.open(CACHE_NAME)
    await cache.put(key, response)
  } catch {
    // Storage or hashing failures leave the network response untouched.
  }
}

async function cached(scope: ServiceWorkerGlobalScope, key: string): Promise<boolean> {
  try { return (await scope.caches.match(key, { cacheName: CACHE_NAME })) !== undefined } catch { return true }
}

/**
 * Stores listed files the cache still lacks. `force-cache` lets the files the page just downloaded come from the
 * browser's HTTP cache instead of the network; only verified bytes are kept, exactly as for a page request.
 */
async function warm(scope: ServiceWorkerGlobalScope, files: ReadonlyMap<string, string>, urls: readonly string[]) {
  const queue = [...new Set(urls)].filter(url => files.has(url))
  const next = async (): Promise<void> => {
    const url = queue.shift()
    if (!url) return
    if (!await cached(scope, url)) {
      try {
        const response = await scope.fetch(url, { cache: 'force-cache', credentials: 'same-origin' })
        if (response.status === 200 && response.type === 'basic') await storeIfVerified(scope, url, files.get(url)!, response)
        else void response.body?.cancel().catch(() => undefined)
      } catch { /* The next visit stores it when the page asks for it. */ }
    }
    return next()
  }
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, next))
}

async function load(scope: ServiceWorkerGlobalScope, request: Request, key: string, digest: string) {
  try {
    const cached = await scope.caches.match(key, { cacheName: CACHE_NAME })
    if (cached) return { response: cached }
  } catch {
    // An unavailable cache falls through to the network.
  }
  const response = await scope.fetch(request)
  if (response.status !== 200 || response.type !== 'basic') return { response }
  return { response, stored: storeIfVerified(scope, key, digest, response.clone()) }
}

/**
 * Serves this build's hashed scripts, styles and data files cache-first. Their names change with their bytes,
 * so a verified copy never needs revalidation; documents, `/sw.js` and the API always use the network.
 */
export function installAppShellCache(scope: ServiceWorkerGlobalScope, { digests, warm: warmPaths }: AppShellConfig): void {
  const files = new Map<string, string>()
  for (const [path, digest] of Object.entries(digests)) files.set(new URL(path, scope.location.origin).href, digest)
  const warmUrls = warmPaths.map(path => new URL(path, scope.location.origin).href)

  // A page this Worker does not control yet (the first visit, or the visit that installs a new build) reports what it
  // downloaded, so the next visit is served from the cache instead of populating it.
  scope.addEventListener('message', event => {
    const data: unknown = event.data
    const source = event.source
    if (!data || typeof data !== 'object' || !('type' in data) || data.type !== APP_SHELL_WARM_MESSAGE
      || !('urls' in data) || !Array.isArray(data.urls) || !source || !('type' in source) || source.type !== 'window'
      || new URL((source as WindowClient).url).origin !== scope.location.origin) return
    const urls = data.urls.filter((url): url is string => typeof url === 'string').slice(0, 512)
    event.waitUntil(warm(scope, files, [...urls, ...warmUrls]).catch(() => undefined))
  })

  scope.addEventListener('fetch', event => {
    const { request } = event
    if (request.method !== 'GET' || request.headers.has('range')) return
    // A caller that asks to bypass caches (e.g. a checksum retry) gets the network.
    if (request.cache === 'reload' || request.cache === 'no-store') return
    const url = new URL(request.url)
    if (url.search) return
    const digest = files.get(url.href)
    if (!digest) return
    const result = load(scope, request, url.href, digest)
    event.respondWith(result.then(({ response }) => response))
    event.waitUntil(result.then(({ stored }) => stored).catch(() => undefined))
  })

  scope.addEventListener('activate', event => {
    event.waitUntil(scope.caches.open(CACHE_NAME).then(async cache => {
      const keys = await cache.keys()
      await Promise.all(keys.filter(key => !files.has(key.url)).map(stale => cache.delete(stale)))
    }).catch(() => undefined))
  })
}
