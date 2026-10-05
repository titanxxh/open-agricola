import { useEffect, useState } from 'react'
type Props = {
  cardId: string
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  t: (key: string) => string
  onComplete?: () => void
}

/** A shared barrier is immediate; completion waits for the affected instances. */
export function CardTakedownButton({ cardId, apiFetch, t, onComplete }: Props) {
  const key = `agricola.card-takedown:${cardId}`
  const [operationId, setOperationId] = useState(() => { try { return sessionStorage.getItem(key) } catch { return null } })
  const [requesting, setRequesting] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!operationId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const response = await apiFetch(`/api/admin/operations/${encodeURIComponent(operationId)}`)
        const result = await response.json() as { ok?: boolean; pending?: boolean }
        if (!response.ok || !result.ok || typeof result.pending !== 'boolean') throw new Error('Unable to read operation status')
        if (stopped) return
        setError('')
        if (!result.pending) {
          try { sessionStorage.removeItem(key) } catch { /* Storage unavailable. */ }
          setOperationId(null); setComplete(true); onComplete?.()
          return
        }
      } catch { if (!stopped) setError(t('platform.networkError')) }
      if (!stopped) timer = setTimeout(() => { void poll() }, 1000)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [operationId, apiFetch, key, onComplete, t])

  const takeDown = async () => {
    if (!window.confirm(t('platform.cardTakedownConfirm'))) return
    setRequesting(true); setError('')
    try {
      const response = await apiFetch(`/api/admin/cards/${encodeURIComponent(cardId)}/takedown`, { method: 'POST' })
      const result = await response.json() as { ok?: boolean; pending?: boolean; operationId?: string; error?: string }
      if (!response.ok || !result.ok || typeof result.pending !== 'boolean' || !result.operationId) throw new Error(result.error ?? t('platform.networkError'))
      if (result.pending) {
        try { sessionStorage.setItem(key, result.operationId) } catch { /* Polling still works in this page. */ }
        setOperationId(result.operationId)
      } else { setComplete(true); onComplete?.() }
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('platform.networkError')) }
    finally { setRequesting(false) }
  }
  return <div>
    <button type="button" className="btn-secondary ws-btn-sm" disabled={requesting || !!operationId || complete} onClick={() => { void takeDown() }}>
      {t(requesting || operationId ? 'platform.cardTakedownPending' : complete ? 'platform.cardTakedownComplete' : 'platform.cardTakedown')}
    </button>
    {operationId && <p role="status">{t('platform.cardTakedownPendingNote')}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
