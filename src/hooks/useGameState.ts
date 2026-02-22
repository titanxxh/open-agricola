import { useEffect, useState } from 'react'
import type { GameState, Resource } from '../game/types'
import type {
  AnimalReorgState,
  HistorySnapshot,
  PendingAnimalReorg,
  PendingChoice,
} from '../types/ui'
import { createInitialState, cloneState, normalizeState } from '../logic/state'
import { fetchState, persistGame } from '../services/api'
import type { Locale } from '../i18n'

export const useGameState = () => {
  const [state, setState] = useState<GameState>(() => createInitialState())
  const [history, setHistory] = useState<HistorySnapshot[]>([])
  const [viewPlayerId, setViewPlayerId] = useState<string>('')
  const [locale, setLocale] = useState<Locale>('en')
  const [pendingNextPlayerIndex, setPendingNextPlayerIndex] = useState<
    number | null
  >(null)
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null)
  const [pendingAnimalReorg, setPendingAnimalReorg] =
    useState<PendingAnimalReorg | null>(null)
  const [animalReorg, setAnimalReorg] = useState<AnimalReorgState | null>(null)
  const [actionStartSnapshot, setActionStartSnapshot] =
    useState<GameState | null>(null)
  const [devMode, setDevMode] = useState(true)
  const [devPlayerId, setDevPlayerId] = useState<string>('')
  const [devResource, setDevResource] = useState<keyof Resource>('wood')
  const [devAmount, setDevAmount] = useState(1)
  const [devRound, setDevRound] = useState(1)

  const pushHistory = (snapshot: HistorySnapshot) => {
    setHistory((prev) => [...prev, snapshot])
  }

  const updateState = (next: GameState) => {
    setState(cloneState(next))
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await fetchState()
        if (!active) return
        if (data?.state) {
          const loaded = data.state as GameState
          const normalized = normalizeState(loaded)
          setState(normalized)
          const currentPlayer =
            normalized.players[normalized.currentPlayerIndex] ??
            normalized.players[0]
          if (currentPlayer) {
            setViewPlayerId(currentPlayer.id)
            setDevPlayerId(currentPlayer.id)
          }
        } else {
          const initial = createInitialState()
          setState(initial)
          await persistGame(initial)
        }
      } catch {
        if (!active) return
        setState(createInitialState())
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!viewPlayerId && state.players[0]) {
      setViewPlayerId(state.players[0].id)
    }
  }, [state.players, viewPlayerId])

  useEffect(() => {
    if (!devPlayerId && state.players[0]) {
      setDevPlayerId(state.players[0].id)
    }
  }, [state.players, devPlayerId])

  useEffect(() => {
    if (viewPlayerId) {
      setDevPlayerId(viewPlayerId)
    }
  }, [viewPlayerId])

  return {
    state,
    setState,
    history,
    setHistory,
    viewPlayerId,
    setViewPlayerId,
    locale,
    setLocale,
    pendingNextPlayerIndex,
    setPendingNextPlayerIndex,
    pendingChoice,
    setPendingChoice,
    pendingAnimalReorg,
    setPendingAnimalReorg,
    animalReorg,
    setAnimalReorg,
    actionStartSnapshot,
    setActionStartSnapshot,
    devMode,
    setDevMode,
    devPlayerId,
    setDevPlayerId,
    devResource,
    setDevResource,
    devAmount,
    setDevAmount,
    devRound,
    setDevRound,
    pushHistory,
    updateState,
  }
}
