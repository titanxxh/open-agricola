/// <reference lib="webworker" />

import { OFFLINE_ENCYCLOPEDIA_PATH } from '../../shared/contract/offline-encyclopedia'
import { readSavedOfflineEncyclopedia } from '../services/offline-encyclopedia-storage'

async function openOfflineEncyclopedia(fallbackHtml: string) {
  const saved = await readSavedOfflineEncyclopedia().catch(() => null)
  return new Response(saved?.archive ?? fallbackHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function installOfflineEncyclopedia(scope: ServiceWorkerGlobalScope, fallbackHtml: string) {
  scope.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || event.request.destination !== 'document') return
    const url = new URL(event.request.url)
    if (url.origin !== scope.location.origin || url.pathname !== OFFLINE_ENCYCLOPEDIA_PATH) return
    event.respondWith(openOfflineEncyclopedia(fallbackHtml))
  })
}
