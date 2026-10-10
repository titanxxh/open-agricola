import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../config'

type Provider = 'github' | 'google'
type LinkResponse = { ok: boolean; code?: string; authorizationUrl?: string }
const HANDOFF_KEYS = ['accountLinkProvider', 'accountLinkState', 'accountLinkCode', 'accountLinkError']
type Handoff = { provider: Provider; body: Record<string, string> }

function readHandoff(): Handoff | 'invalid' | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  if (!HANDOFF_KEYS.some(key => fragment.has(key))) return null
  const provider = fragment.get('accountLinkProvider')
  const state = fragment.get('accountLinkState')
  const code = fragment.get('accountLinkCode')
  const error = fragment.get('accountLinkError')
  if ((provider !== 'github' && provider !== 'google') || !state) return 'invalid'
  if (error === 'oauth_cancelled' || error === 'oauth_state_invalid') return { provider, body: { state, error } }
  if (code) return { provider, body: { state, code } }
  return 'invalid'
}

async function postLink(path: string, body: Record<string, string>): Promise<LinkResponse> {
  const response = await fetch(path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json() as LinkResponse
  return { ...data, ok: response.ok && data.ok === true }
}

export function useAccountLinking(startUrl: (provider: Provider, intent: 'link') => string) {
  const [handoff] = useState(readHandoff)
  const submitted = useRef(false)
  const [busy, setBusy] = useState(!!handoff && handoff !== 'invalid')
  const [linked, setLinked] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(handoff === 'invalid' ? 'oauth_state_invalid' : null)

  useEffect(() => {
    if (!handoff || submitted.current) return
    submitted.current = true
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    for (const key of HANDOFF_KEYS) fragment.delete(key)
    const hash = fragment.toString()
    // Clear before any async work, including StrictMode's effect replay.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`)
    if (handoff === 'invalid') return
    void postLink(`${API_BASE}/api/auth/oauth/${handoff.provider}/complete`, handoff.body)
      .then(data => {
        if (data.ok) setLinked(true)
        else setErrorCode(data.code ?? 'oauth_state_invalid')
      })
      .catch(() => setErrorCode('network_error'))
      .finally(() => setBusy(false))
  }, [handoff])

  const start = async (provider: Provider) => {
    if (busy) return
    setBusy(true)
    setErrorCode(null)
    try {
      const data = await postLink(startUrl(provider, 'link'), {})
      if (data.ok && data.authorizationUrl) window.location.assign(data.authorizationUrl)
      else setErrorCode(data.code ?? 'oauth_state_invalid')
    } catch { setErrorCode('network_error') }
    finally { setBusy(false) }
  }

  return { busy, linked, errorCode, start }
}
