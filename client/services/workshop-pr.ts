import { API_BASE } from '../config'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: 'include' })
}

export type ProposeFailure = {
  ok: false
  submissionId?: string
  state?: 'pending' | 'blocked' | 'failed'
  code?: string
  prUrl?: string
  retryAfter?: number
  needsAttention?: boolean
}
export type ProposeResponse = ProposeFailure | {
  ok: true
  submissionId?: string
  prUrl: string
  prNumber: number
  code?: string
}

export async function submissionStatus(cardDbId: string): Promise<ProposeResponse> {
  return (await apiFetch(`/api/workshop/cards/${encodeURIComponent(cardDbId)}/submit-review`)).json()
}

export async function startPropose(cardDbId: string, action: 'submit' | 'recover' | 'restart' = 'submit'): Promise<ProposeResponse> {
  const response = await apiFetch(`/api/workshop/cards/${encodeURIComponent(cardDbId)}/submit-review`, {
    method: 'POST', body: JSON.stringify({ action }), headers: { 'Content-Type': 'application/json' },
  })
  return response.json()
}

export type RefreshResponse =
  | { ok: true; status: 'open' | 'merged' | 'closed' }
  | { ok: false; code?: string; retryAfter?: number; error?: string; status?: number }

export async function refreshPrStatus(cardDbId: string): Promise<RefreshResponse> {
  return (await apiFetch(`/api/workshop/cards/${cardDbId}/refresh-pr-status`, { method: 'POST' })).json()
}

export function extractPrNumber(url: string | null | undefined): number | null {
  const match = url?.match(/\/pull\/(\d+)/)
  return match ? Number(match[1]) : null
}
