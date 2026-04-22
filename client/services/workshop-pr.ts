// Workshop → Main Repo PR integration: client-side helpers.
//
// Wraps the three backend endpoints (/api/workshop/cards/:id/propose,
// /api/workshop/cards/:id/refresh-pr-status) plus an OAuth popup helper
// that listens for the callback's postMessage.

import { API_BASE } from '../config'

// Shared apiFetch-like wrapper. AuthContext's apiFetch is a hook value,
// but these helpers are called from inside components that already have
// a token — we read it from localStorage here to keep the service plain.
const TOKEN_KEY = 'open-agricola-token'
function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = readToken()
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

export type ProposeNeedsAuth = {
  ok: false
  needsAuth: true
  authUrl: string
  handshakeId: string
}
export type ProposeSuccess = {
  ok: true
  prUrl: string
  prNumber: number
}
export type ProposeFailure = {
  ok: false
  needsAuth?: false
  code?: string
  message?: string
  retryAfter?: number
  error?: string
}
export type ProposeResponse = ProposeNeedsAuth | ProposeSuccess | ProposeFailure

export async function startPropose(cardDbId: string): Promise<ProposeResponse> {
  const r = await apiFetch(`/api/workshop/cards/${cardDbId}/propose`, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  })
  return (await r.json()) as ProposeResponse
}

export async function completePropose(cardDbId: string, handshakeId: string): Promise<ProposeResponse> {
  const r = await apiFetch(`/api/workshop/cards/${cardDbId}/propose`, {
    method: 'POST',
    body: JSON.stringify({ handshakeId }),
    headers: { 'Content-Type': 'application/json' },
  })
  return (await r.json()) as ProposeResponse
}

export type RefreshResponse =
  | { ok: true; status: 'open' | 'merged' | 'closed' }
  | { ok: false; code?: string; retryAfter?: number; error?: string; status?: number }

export async function refreshPrStatus(cardDbId: string): Promise<RefreshResponse> {
  const r = await apiFetch(`/api/workshop/cards/${cardDbId}/refresh-pr-status`, { method: 'POST' })
  return (await r.json()) as RefreshResponse
}

/**
 * Compute which origins are acceptable for the postMessage sender.
 * The callback page is served from the backend; in dev the frontend proxies
 * /api, so window.location.origin matches. In production API_BASE may be a
 * different host (e.g., open-agricola.duckdns.org), so we accept it too.
 */
function allowedMessageOrigins(): Set<string> {
  const origins = new Set<string>()
  origins.add(window.location.origin)
  if (API_BASE) {
    try {
      origins.add(new URL(API_BASE, window.location.origin).origin)
    } catch {
      /* ignore */
    }
  }
  return origins
}

/**
 * Open the OAuth popup and wait for the callback's postMessage.
 * Returns { ok: true } when the callback page succeeded, or { ok: false, error } on denial/timeout.
 */
export function openOAuthPopupAndWait(
  authUrl: string,
  expectedHs: string,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const popup = window.open(authUrl, 'workshop-pr-oauth', 'width=600,height=700')
    let done = false
    const allowed = allowedMessageOrigins()

    const timer = setTimeout(() => {
      if (done) return
      done = true
      cleanup()
      resolve({ ok: false, error: 'timeout' })
    }, timeoutMs)

    function onMessage(e: MessageEvent) {
      if (done) return
      if (!allowed.has(e.origin)) return
      const data = e.data as { type?: string; result?: { ok: boolean; hs: string; error?: string } } | undefined
      if (data?.type !== 'workshop-pr-oauth' || data.result?.hs !== expectedHs) return
      done = true
      cleanup()
      resolve({ ok: !!data.result?.ok, error: data.result?.error })
    }

    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      try { popup?.close() } catch { /* ignore */ }
    }

    window.addEventListener('message', onMessage)
  })
}

/**
 * Extract PR number from a URL like https://github.com/owner/repo/pull/42
 */
export function extractPrNumber(url: string | null | undefined): number | null {
  if (!url) return null
  const m = url.match(/\/pull\/(\d+)/)
  return m ? Number(m[1]) : null
}
