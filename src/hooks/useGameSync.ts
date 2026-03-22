import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState, InteractionState, PendingAction } from '../../shared/game/types'
import type { PlayerScoreSummary } from '../../shared/logic/scoring'
import type { GameSyncPayload } from '../../shared/protocol/game'
import { rehydrateState } from '../../shared/game/serialization'

export type SyncedPending = PendingAction

export const useGameSync = () => {
  const [state, setState] = useState<GameState | null>(null)
  const [pending, setPending] = useState<SyncedPending>({ type: 'none' })
  const [interaction, setInteraction] = useState<InteractionState>({
    stateId: 'idle',
    allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
    anytimeActions: [],
  })
  const [scores, setScores] = useState<PlayerScoreSummary[] | null>(null)
  const [pastureCapacities, setPastureCapacities] = useState<Record<string, Record<string, number>>>({})
  const [error, setError] = useState<string | null>(null)
  const [historyLength, setHistoryLength] = useState(0)
  const [hasActionStartSnapshot, setHasActionStartSnapshot] = useState(false)
  const [actionAvailability, setActionAvailability] = useState<Record<string, boolean>>({})
  const [cardAvailability, setCardAvailability] = useState<Record<string, boolean>>({})
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
    setInteraction(payload.interaction)
    setScores(payload.scores ?? null)
    setPastureCapacities(payload.pastureCapacities ?? {})
    setError(payload.ok ? null : (payload.error ?? 'unknown error'))
    setHistoryLength(payload.historyLength ?? 0)
    setHasActionStartSnapshot(payload.hasActionStartSnapshot ?? false)
    setActionAvailability(payload.actionAvailability ?? {})
    setCardAvailability(payload.cardAvailability ?? {})
  }, [])

  return {
    state,
    pending,
    interaction,
    scores,
    pastureCapacities,
    error,
    historyLength,
    hasActionStartSnapshot,
    actionAvailability,
    cardAvailability,
    applySnapshot,
  }
}
