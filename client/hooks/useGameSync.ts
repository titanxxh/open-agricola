import type { HistoryWindow } from '../../shared/contract/protocol/history'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerScoreSummary } from '../../shared/domain'
import type { ClientInteractionState, GameSyncPayload, PrivateGameEvent } from '../../shared/contract/protocol/game'
import { rehydrateStateForClient, type ClientGameState } from '../services/rehydrate'
import { registerCustomCardMetadata } from '../../shared/cards/custom-card-metadata'

export const useGameSync = () => {
  const [state, setState] = useState<ClientGameState | null>(null)
  const [interaction, setInteraction] = useState<ClientInteractionState>({
    stateId: 'idle',
    allowedCommands: [],
    anytimeActions: [],
  })
  const [scores, setScores] = useState<PlayerScoreSummary[] | null>(null)
  const [pastureCapacities, setPastureCapacities] = useState<Record<string, Record<string, number>>>({})
  const [error, setError] = useState<string | null>(null)
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow | undefined>()
  const [historyLength, setHistoryLength] = useState(0)
  const [hasActionStartSnapshot, setHasActionStartSnapshot] = useState(false)
  const [actionAvailability, setActionAvailability] = useState<Record<string, boolean>>({})
  const [cardAvailability, setCardAvailability] = useState<Record<string, boolean>>({})
  const [privateEvents, setPrivateEvents] = useState<PrivateGameEvent[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const applySnapshot = useCallback((payload: GameSyncPayload) => {
    if (!mountedRef.current) return
    // Register custom card metadata for frontend display.
    if (payload.customCardDefs) {
      for (const def of payload.customCardDefs) {
        registerCustomCardMetadata({ cardType: def.cardType, cardJson: def.cardJson, artUrl: def.artUrl })
      }
    }
    const hydrated = rehydrateStateForClient(payload.state)
    setState(hydrated)
    setInteraction(payload.interaction)
    setScores(payload.scores ?? null)
    setPastureCapacities(payload.pastureCapacities ?? {})
    setError(payload.ok ? null : (payload.error ?? 'unknown error'))
    setHistoryWindow(payload.historyWindow)
    setHistoryLength(payload.historyLength ?? 0)
    setHasActionStartSnapshot(payload.hasActionStartSnapshot ?? false)
    setActionAvailability(payload.actionAvailability ?? {})
    setCardAvailability(payload.cardAvailability ?? {})
    setPrivateEvents(payload.privateEvents ?? [])
  }, [])

  return {
    state,
    interaction,
    scores,
    pastureCapacities,
    error,
    historyLength,
    historyWindow,
    hasActionStartSnapshot,
    actionAvailability,
    cardAvailability,
    privateEvents,
    applySnapshot,
  }
}
