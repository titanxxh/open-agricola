import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState, PendingAction } from '../../shared/game/types'
import type { PlayerScoreSummary } from '../../shared/logic/scoring'
import type { GameSyncPayload } from '../../shared/protocol/game'
import { rehydrateState } from '../../shared/game/serialization'

export type SyncedPending = PendingAction

export const useGameSync = () => {
  const [state, setState] = useState<GameState | null>(null)
  const [pending, setPending] = useState<SyncedPending>({ type: 'none' })
  const [scores, setScores] = useState<PlayerScoreSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyLength, setHistoryLength] = useState(0)
  const [hasActionStartSnapshot, setHasActionStartSnapshot] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const applySnapshot = useCallback((payload: GameSyncPayload) => {
    if (!mountedRef.current) return
    const hydrated = rehydrateState(payload.state)
    setState(hydrated)
    setPending(payload.pending)
    setScores(payload.scores ?? null)
    setError(payload.ok ? null : (payload.error ?? 'unknown error'))
    setHistoryLength(payload.historyLength ?? 0)
    setHasActionStartSnapshot(payload.hasActionStartSnapshot ?? false)
  }, [])

  return { state, pending, scores, error, historyLength, hasActionStartSnapshot, applySnapshot }
}
