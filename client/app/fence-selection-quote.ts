import { useEffect, useState } from 'react'
import type { FenceSelectionPayload, FenceSelectionQuote } from '../../shared/contract/protocol/game'
import type { GameTransport } from '../services/gameTransport'

type FenceQuoteRequest = { playerIndex: number; requestKey: string; payload: FenceSelectionPayload }
export type FenceSelectionQuoteState =
  | { kind: 'idle' | 'pending' | 'unavailable' }
  | { kind: 'ready'; quote: FenceSelectionQuote }

export const useFenceSelectionQuote = ({ snapshot, request, transport }: {
  snapshot: object | null
  request: FenceQuoteRequest | null
  transport: Pick<GameTransport, 'quoteFenceSelection'>
}): FenceSelectionQuoteState => {
  const key = JSON.stringify(request)
  const [completed, setCompleted] = useState<{
    snapshot: object | null
    key: string
    result: FenceSelectionQuoteState
  } | null>(null)
  useEffect(() => {
    if (!request) return
    let canceled = false
    void transport.quoteFenceSelection(request.playerIndex, request.requestKey, request.payload).then(quote => {
      if (canceled) return
      setCompleted({ snapshot, key, result: quote.requestKey === request.requestKey ? { kind: 'ready', quote } : { kind: 'unavailable' } })
    }).catch(() => {
      if (!canceled) setCompleted({ snapshot, key, result: { kind: 'unavailable' } })
    })
    return () => { canceled = true }
  }, [key, request, snapshot, transport])
  if (!request) return { kind: 'idle' }
  return completed?.snapshot === snapshot && completed.key === key ? completed.result : { kind: 'pending' }
}
