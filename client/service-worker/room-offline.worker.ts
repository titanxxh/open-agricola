/// <reference lib="webworker" />

import { gameContextLinkFromQuery } from '../utils/game-room-url'

const CACHE_NAME = 'open-agricola-room-offline-v1'
const PAGE_KEY = '/__oa-room-offline-retry'

export type RoomOfflineMessages = Readonly<Record<'en' | 'zh', { message: string; retry: string }>>

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

async function retryPage(scope: ServiceWorkerGlobalScope, messages: RoomOfflineMessages): Promise<Response> {
  const encodedCopy = JSON.stringify(messages).replaceAll('<', '\\u003c')
  const script = `
const messages = ${encodedCopy}
let locale = 'zh'
try {
  if (localStorage.getItem('open-agricola-locale-v2') === 'en') locale = 'en'
} catch {}
const { message, retry } = messages[locale]
const retryButton = document.querySelector('button')
document.documentElement.lang = locale
document.title = message
document.querySelector('h1').textContent = message
retryButton.textContent = retry
retryButton.addEventListener('click', () => location.reload())
`
  const hash = new Uint8Array(await scope.crypto.subtle.digest('SHA-256', new TextEncoder().encode(script)))
  const scriptHash = scope.btoa(String.fromCharCode(...hash))
  const { message, retry } = messages.zh
  return new Response(`<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(message)}</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { display: grid; min-height: 100vh; margin: 0; place-items: center; }
main { box-sizing: border-box; width: min(100%, 36rem); padding: 2rem; }
h1 { margin: 0 0 1.5rem; font-size: 1.5rem; line-height: 1.45; }
button { min-width: 6rem; min-height: 2.75rem; padding: .5rem 1rem; font: inherit; cursor: pointer; }
</style>
</head>
<body>
<main>
<h1>${escapeText(message)}</h1>
<button type="button">${escapeText(retry)}</button>
</main>
<script>${script}</script>
</body>
</html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; frame-ancestors 'none'`,
  } })
}

export function installRoomOffline(scope: ServiceWorkerGlobalScope, messages: RoomOfflineMessages): void {
  const pageUrl = new URL(PAGE_KEY, scope.location.origin).href

  scope.addEventListener('install', event => {
    event.waitUntil((async () => {
      const response = await retryPage(scope, messages)
      const cache = await scope.caches.open(CACHE_NAME)
      await cache.put(pageUrl, response)
    })().catch(() => undefined))
  })

  scope.addEventListener('fetch', event => {
    const { request } = event
    if (request.method !== 'GET' || request.mode !== 'navigate' || request.destination !== 'document') return
    const url = new URL(request.url)
    if (url.origin !== scope.location.origin || url.pathname !== '/' || !gameContextLinkFromQuery(url.search)) return

    // Keep the browser's HTTP cache and the origin's HTTP statuses by forwarding the original navigation.
    event.respondWith(scope.fetch(request).catch(async (networkError: unknown) => {
      const page = await scope.caches.match(pageUrl, { cacheName: CACHE_NAME }).catch(() => undefined)
      if (page) return page
      throw networkError
    }))
  })
}
