/// <reference lib="webworker" />

const CACHE_NAME = 'open-agricola-app-shell-v1'

/** Site-relative paths of this build's content-addressed files, each with the SHA-256 of its bytes. */
export type AppShellDigests = Readonly<Record<string, string>>

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
export function installAppShellCache(scope: ServiceWorkerGlobalScope, digests: AppShellDigests): void {
  const files = new Map<string, string>()
  for (const [path, digest] of Object.entries(digests)) files.set(new URL(path, scope.location.origin).href, digest)

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
