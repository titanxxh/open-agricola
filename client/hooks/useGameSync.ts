import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerScoreSummary } from '../../shared/domain'
import type { ClientInteractionState, GameSyncPayload, PrivateGameEvent } from '../../shared/contract/protocol/game'
import { rehydrateStateForClient, type ClientGameState } from '../services/rehydrate'
import { registerCustomCard } from '../../shared/cards/custom-registry'

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
    // Register custom card definitions so they resolve via getMinorImprovement/getOccupation
    if (payload.customCardDefs) {
      for (const def of payload.customCardDefs) {
        registerCustomCard(
          { cardType: def.cardType, cardJson: def.cardJson, artUrl: def.artUrl },
          { allowGlobal: true },
        )
      }
    }
    const hydrated = rehydrateStateForClient(payload.state)
    setState(hydrated)
    setInteraction(payload.interaction)
    setScores(payload.scores ?? null)
    setPastureCapacities(payload.pastureCapacities ?? {})
    setError(payload.ok ? null : (payload.error ?? 'unknown error'))
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
    hasActionStartSnapshot,
    actionAvailability,
    cardAvailability,
    privateEvents,
    applySnapshot,
  }
}
