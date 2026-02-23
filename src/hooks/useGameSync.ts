import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '../../shared/game/types'
import type { GameApiResponse } from './useGameApi'
import { normalizeState } from '../../shared/logic/state'
import { createActionSpaces } from '../../shared/actions'

export type SyncedPending = GameApiResponse['pending']

const rehydrateState = (raw: GameState): GameState => {
  const actionSpaces = createActionSpaces()
  const restored = normalizeState(raw)
  restored.actionSpaces = actionSpaces.map((template) => {
    const saved = raw.actionSpaces?.find((s) => s.id === template.id)
    return {
      ...template,
      resources: saved?.resources ?? template.resources,
      takenBy: saved?.takenBy ?? null,
    }
  })
  return restored
}

export const useGameSync = () => {
  const [state, setState] = useState<GameState | null>(null)
  const [pending, setPending] = useState<SyncedPending>({ type: 'none' })
  const [scores, setScores] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const applyResponse = useCallback((resp: GameApiResponse) => {
    if (!mountedRef.current) return
    const hydrated = rehydrateState(resp.state)
    setState(hydrated)
    setPending(resp.pending)
    setScores(resp.scores ?? null)
    setError(resp.ok ? null : (resp.error ?? 'unknown error'))
  }, [])

  return { state, pending, scores, error, applyResponse }
}
