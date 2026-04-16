import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import type { ActionSpace, FarmTilePosition, PlayerState, Resource } from '../../shared/game/types'
import { t } from '../../shared/i18n'
import type { AnimalReorgState } from '../types/ui'
import { positionKey } from '../../shared/game/farm'
import { emptyResources, resourceKeyList } from '../../shared/logic/state'
import { useGameSync } from '../hooks/useGameSync'
import { HttpGameTransport, WsGameTransport, type GameTransport } from '../services/gameTransport'
import type { GameSyncPayload } from '../../shared/protocol/game'
import { rehydrateState } from '../../shared/game/serialization'
import { useFarmSelection } from '../hooks/useFarmSelection'
import { buildHarvestFeedOptions } from './hooks/use-harvest-flow'
import { DevPanel } from '../components/dev/DevPanel'
import { ActionBoard } from '../components/board/ActionBoard'
import { FarmBoard } from '../components/board/FarmBoard'
import { LogPanel } from '../components/board/LogPanel'
import { MajorImprovements } from '../components/board/MajorImprovements'
import { ScoringPad } from '../components/board/ScoringPad'
import { GameHeader } from '../components/header/GameHeader'
import { InteractionBar } from '../components/interaction/InteractionBar'
import { AnytimeBar } from '../components/interaction/AnytimeBar'
import { BrandMark } from '../components/common/BrandMark'
import { ResourceLine } from '../components/common/ResourceLine'

type RoundSlot = { round: number; action?: ActionSpace }

const httpTransportSingleton = new HttpGameTransport()

/** Update browser URL to include room= so the link can be shared; same room id = same game. */
const setRoomInUrl = (roomId: string) => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.set('room', roomId)
  const newSearch = params.toString()
  const newUrl = `${window.location.pathname}${newSearch ? '?' + newSearch : ''}${window.location.hash || ''}`
  window.history.replaceState(null, '', newUrl)
}

const toRequestedPlayerIndex = (playerParam: string | null) => {
  if (!playerParam) return undefined
  const match = /^p(\d+)$/.exec(playerParam)
  if (!match) return undefined
  const playerIndex = Number(match[1]) - 1
  return Number.isInteger(playerIndex) && playerIndex >= 0
    ? playerIndex
    : undefined
}

type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | { phase: 'waiting'; roomId: string; players: Array<{ playerIndex: number; name: string }>; maxPlayers: number }
  | { phase: 'ready'; roomId: string; playerIndex: number }
  | { phase: 'error'; message: string }

const useTransportSetup = (playerParam: string | null, displayName?: string, isWsMode = false) => {
  const [wsStatus, setWsStatus] = useState<WsStatus>({ phase: 'idle' })
  const wsRef = useRef<WsGameTransport | null>(null)
  const [wsReady, setWsReady] = useState(false)

  const initRef = useRef(false)

  useEffect(() => {
    if (!isWsMode || initRef.current) return
    initRef.current = true

    const init = async () => {
      setWsStatus({ phase: 'connecting' })
      const ws = new WsGameTransport()

      try {
        await ws.connect()
      } catch {
        setWsStatus({ phase: 'error', message: 'WebSocket connection failed' })
        return
      }

      wsRef.current = ws
      const rawWs = (ws as unknown as { ws: WebSocket }).ws
      if (!rawWs) {
        setWsStatus({ phase: 'error', message: 'no WebSocket instance' })
        return
      }

      const roomParam = new URLSearchParams(window.location.search).get('room')
      const isCreator = !roomParam && (!playerParam || playerParam === 'p1')

      if (isCreator) {
        setWsStatus({ phase: 'creating' })
        const resp = await new Promise<{ roomId: string; playerIndex: number; maxPlayers: number } | { error: string }>((resolve) => {
          const handler = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data as string)
              if (msg.type === 'roomCreated') {
                rawWs.removeEventListener('message', handler)
                resolve({ roomId: msg.roomId, playerIndex: msg.playerIndex, maxPlayers: msg.maxPlayers ?? 2 })
              } else if (msg.type === 'error') {
                rawWs.removeEventListener('message', handler)
                resolve({ error: msg.error })
              }
            } catch { /* skip */ }
          }
          rawWs.addEventListener('message', handler)
          const customCardsParam = new URLSearchParams(window.location.search).get('customCards')
          const customCardIds = customCardsParam ? customCardsParam.split(',').filter(Boolean) : undefined
          const maxPlayersParam = new URLSearchParams(window.location.search).get('maxPlayers')
          const maxPlayers = maxPlayersParam ? Math.min(Math.max(2, Number(maxPlayersParam)), 4) : 2
          ws.sendRoomCommand('createRoom', { maxPlayers, name: displayName ?? playerParam ?? 'Player 1', customCardIds })
        })

        if ('error' in resp) {
          setWsStatus({ phase: 'error', message: resp.error })
          return
        }
        setRoomInUrl(resp.roomId)
        const creatorName = displayName ?? playerParam ?? 'Player 1'
        setWsStatus({
          phase: 'waiting',
          roomId: resp.roomId,
          players: [{ playerIndex: resp.playerIndex, name: creatorName }],
          maxPlayers: resp.maxPlayers,
        })

        const handler = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string)
            if (msg.type === 'gameStarted') {
              rawWs.removeEventListener('message', handler)
              setWsReady(true)
              setWsStatus({ phase: 'ready', roomId: resp.roomId, playerIndex: resp.playerIndex })
            } else if (msg.type === 'playerJoined') {
              setWsStatus(prev => {
                if (prev.phase !== 'waiting') return prev
                const existing = prev.players.filter(p => p.playerIndex !== msg.playerIndex)
                return {
                  ...prev,
                  players: [...existing, { playerIndex: msg.playerIndex, name: msg.name }].sort((a, b) => a.playerIndex - b.playerIndex),
                  maxPlayers: msg.maxPlayers,
                }
              })
            } else if (msg.type === 'roomDissolved') {
              rawWs.removeEventListener('message', handler)
              setWsStatus({ phase: 'error', message: 'roomDissolved' })
            }
          } catch { /* skip */ }
        }
        rawWs.addEventListener('message', handler)
      } else {
        let roomId = roomParam
        const requestedPlayerIndex = toRequestedPlayerIndex(playerParam)
        if (!roomId) {
          setWsStatus({
            phase: 'error',
            message: 'No room in URL. Use the link shared by Player 1 (URL must contain room=...) to join the same game.',
          })
          return
        }

        setWsStatus({ phase: 'joining', roomId })
        const resp = await new Promise<{ roomId: string; playerIndex: number } | { error: string }>((resolve) => {
          const handler = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data as string)
              if (msg.type === 'roomJoined') {
                rawWs.removeEventListener('message', handler)
                resolve({ roomId: msg.roomId, playerIndex: msg.playerIndex })
              } else if (msg.type === 'error') {
                rawWs.removeEventListener('message', handler)
                resolve({ error: msg.error })
              }
            } catch { /* skip */ }
          }
          rawWs.addEventListener('message', handler)
          ws.sendRoomCommand('joinRoom', {
            roomId: roomId!,
            name: displayName ?? playerParam ?? 'Player 2',
            requestedPlayerIndex,
          })
        })

        if ('error' in resp) {
          setWsStatus({ phase: 'error', message: resp.error })
          return
        }
        setRoomInUrl(resp.roomId)
        setWsReady(true)
        setWsStatus({ phase: 'ready', roomId: resp.roomId, playerIndex: resp.playerIndex })
      }
    }

    init()
  }, [playerParam])

  const transport: GameTransport = isWsMode && wsReady && wsRef.current ? wsRef.current : httpTransportSingleton
  const isReady = !isWsMode || wsReady
  return { transport, wsStatus, isWs: isWsMode, isReady, wsTransport: wsRef.current }
}

export const GameContainerApi = () => {
  // Read URL params fresh on each render (navigated here from lobby — don't use module-level stale values)
  const currentUrlParams = new URLSearchParams(window.location.search)
  const isWsMode = currentUrlParams.get('transport') === 'ws'
  const isEmbedded = currentUrlParams.get('embedded') === '1'

  const lockedViewPlayerId = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const raw = p.get('player') ?? p.get('playerId')
    if (!raw) return null
    if (/^p[1-4]$/.test(raw)) return raw
    const index = Number(raw)
    if (Number.isFinite(index) && index >= 1 && index <= 4) return `p${index}`
    return null
  }, [])
  const { user } = useAuth()
  const { transport, wsStatus, isWs, isReady, wsTransport } = useTransportSetup(lockedViewPlayerId, user?.displayName, isWsMode)
  const { state, pending, interaction, scores, pastureCapacities, historyLength, hasActionStartSnapshot, actionAvailability, cardAvailability, applySnapshot } =
    useGameSync()
  const { locale } = useLocale()
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(lockedViewPlayerId)
  const [showScoringPad, setShowScoringPad] = useState(false)
  const [devMode, setDevMode] = useState(() => currentUrlParams.get('devMode') === '1')
  const [animalReorg, setAnimalReorg] = useState<AnimalReorgState | null>(null)
  const [bakeExchangeCounts, setBakeExchangeCounts] = useState<Record<string, number>>({})
  const [harvestFeedCounts, setHarvestFeedCounts] = useState<Record<string, number>>({})
  const [devPlayerId, setDevPlayerId] = useState('')
  const [devResource, setDevResource] = useState<keyof Resource>('wood')
  const [devAmount, setDevAmount] = useState(1)
  const [devRound, setDevRound] = useState(1)
  const [devCardId, setDevCardId] = useState('')
  const [resetSeedInput, setResetSeedInput] = useState('')

  useEffect(() => {
    if (state && viewPlayerId) {
      setDevPlayerId(viewPlayerId)
    } else if (state) {
      setDevPlayerId(state.players[state.currentPlayerIndex]?.id ?? '')
    }
  }, [state?.currentPlayerIndex, viewPlayerId])

  const {
    pendingFenceEdges, setPendingFenceEdges, fenceError, setFenceError,
    pendingRoomTiles, setPendingRoomTiles, roomError, setRoomError,
    pendingStableTiles, setPendingStableTiles, stableError, setStableError,
    pendingPlowTile, setPendingPlowTile, plowError, setPlowError,
    pendingSowSelections, setPendingSowSelections, sowError, setSowError,
    toggleFenceEdge,
    toggleRoomTile: toggleRoomTileInternal,
    toggleStableTile: toggleStableTileInternal,
    togglePlowTile: togglePlowTileInternal,
    updateSowSelection: updateSowSelectionInternal,
    pendingFieldSelections, setPendingFieldSelections,
    toggleFieldSelection: toggleFieldSelectionInternal,
  } = useFarmSelection()

  const handleSnapshot = useCallback((payload: GameSyncPayload) => {
    applySnapshot(payload)
    if (payload.interaction.stateId === 'animalReorg') {
      setAnimalReorg({
        zones: payload.interaction.zones,
        confirmDiscard: false,
      })
    } else if (payload.pending.type === 'animalReorg') {
      const hydrated = rehydrateState(payload.state)
      const player = hydrated.players[payload.pending.playerIndex]
      if (player) {
        setAnimalReorg(null)
      }
    } else {
      setAnimalReorg(null)
    }
    if (payload.ok) {
      setPendingFenceEdges([])
      setFenceError(null)
      setPendingRoomTiles([])
      setRoomError(null)
      setPendingStableTiles([])
      setStableError(null)
      setPendingPlowTile(null)
      setPlowError(null)
      setPendingSowSelections({})
      setSowError(null)
      setPendingFieldSelections(new Set())
    }
  }, [applySnapshot, setPendingFenceEdges, setFenceError, setPendingRoomTiles, setRoomError, setPendingStableTiles, setStableError, setPendingPlowTile, setPlowError, setPendingSowSelections, setSowError, setPendingFieldSelections])

  useEffect(() => {
    if (!isReady) return
    const unsub = transport.onSnapshot(handleSnapshot)
    transport.getState().catch((e) => { console.error("fetchState failed:", e) })
    return unsub
  }, [transport, handleSnapshot, isReady])

  const currentPlayer = state?.players[state.currentPlayerIndex] ?? null
  // In WS mode, selfPlayer is locked to the URL ?player= param.
  // In HTTP mode (sandbox/single-player), selfPlayer follows the current player.
  const selfPlayer = isWs && lockedViewPlayerId
    ? state?.players.find((p) => p.id === lockedViewPlayerId) ?? currentPlayer
    : currentPlayer
  const viewedPlayer = state?.players.find((p) => p.id === viewPlayerId) ?? selfPlayer ?? currentPlayer
  // In WS mode, viewPlayerId lets you peek at another player's board.
  // In HTTP (sandbox) mode, display follows the current player so the panel switches on turn change.
  const displayPlayer = isWs
    ? ((viewPlayerId ? viewedPlayer : selfPlayer ?? currentPlayer) ?? state?.players[0] ?? null)
    : (selfPlayer ?? currentPlayer ?? state?.players[0] ?? null)
  const activePlayer = interaction.stateId === 'confirmPlayerSwitch'
    ? state?.players[interaction.fromPlayerIndex] ?? currentPlayer
    : ('playerIndex' in interaction && typeof interaction.playerIndex === 'number')
      ? state?.players[interaction.playerIndex] ?? currentPlayer
      : currentPlayer
  const isMyTurn = !!(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)
  // In HTTP (non-WS) mode, one human controls all players — always interactive
  const isInteractive = isWs
    ? !!(activePlayer && selfPlayer && displayPlayer &&
         activePlayer.id === selfPlayer.id && displayPlayer.id === selfPlayer.id)
    : !!(activePlayer && displayPlayer)

  const takeAction = useCallback((space: ActionSpace) => {
    if (!state || !isInteractive) return
    void transport.takeAction(state.currentPlayerIndex, space.id).catch((e) => console.error('takeAction error', e))
  }, [state, transport, isInteractive])

  const undoStep = useCallback(() => {
    if (!isInteractive) return
    void transport.undoStep().catch((e) => console.error('undo error', e))
  }, [transport, isInteractive])

  const undoAction = useCallback(() => {
    if (!isInteractive) return
    void transport.undoAction().catch((e) => console.error('undoAction error', e))
  }, [transport, isInteractive])

  const takeAnytimeAction = useCallback((actionId: string) => {
    if (!state || !isInteractive) return
    void transport.takeAnytimeAction(state.currentPlayerIndex, actionId).catch((e) => {
      console.error('takeAnytimeAction error', e)
    })
  }, [state, transport, isInteractive])

  const resolveChoice = useCallback((value: string) => {
    if (!isInteractive) return
    if (!currentPlayer) return
    if (interaction.stateId === 'farmSelect') {
      const pendingPlayerIndex = interaction.playerIndex
      if (value === 'cancel') {
        void transport.resolveChoice(pendingPlayerIndex, value).catch((e) => console.error(e))
        return
      }
      if (interaction.farm.farmType === 'fence') {
        void transport.commitFarm(pendingPlayerIndex, 'fence', {
          edges: pendingFenceEdges,
          extraWood: interaction.farm.extraWood ?? 0,
        }).catch((e) => console.error(e))
        return
      }
      if (interaction.farm.farmType === 'room') {
        void transport.commitFarm(pendingPlayerIndex, 'room', {
          rooms: pendingRoomTiles,
        }).catch((e) => console.error(e))
        return
      }
      if (interaction.farm.farmType === 'stable') {
        void transport.commitFarm(pendingPlayerIndex, 'stable', {
          stables: pendingStableTiles,
        }).catch((e) => console.error(e))
        return
      }
      if (interaction.farm.farmType === 'plow') {
        if (!pendingPlowTile) {
          setPlowError('NO_SELECTION')
          return
        }
        void transport.commitFarm(pendingPlayerIndex, 'plow', {
          tile: pendingPlowTile,
        }).catch((e) => console.error(e))
        return
      }
      if (interaction.farm.farmType === 'field-select') {
        const fields = [...pendingFieldSelections].map((key) => {
          const [r, c] = key.split('-').map(Number)
          return { row: r, col: c }
        })
        void transport.commitFarm(pendingPlayerIndex, 'field-select', { fields })
          .catch((e) => console.error(e))
        return
      }
      if (interaction.farm.farmType === 'sow') {
        const crops = Object.entries(pendingSowSelections)
          .map(([key, crop]) => {
            const [rowText, colText] = key.split('-')
            const row = Number(rowText)
            const col = Number(colText)
            if (!Number.isFinite(row) || !Number.isFinite(col)) return null
            return { row, col, crop }
          })
          .filter((entry): entry is { row: number; col: number; crop: 'grain' | 'vegetable' } => !!entry)
        if (crops.length === 0) {
          setSowError('NO_SELECTION')
          return
        }
        void transport.commitFarm(pendingPlayerIndex, 'sow', { crops }).catch((e) => console.error(e))
        return
      }
      return
    }
    if (interaction.stateId !== 'choice') return
    void transport.resolveChoice(interaction.playerIndex, value).catch((e) => console.error(e))
  }, [interaction, currentPlayer, pendingFenceEdges, pendingRoomTiles, pendingStableTiles, pendingPlowTile, pendingFieldSelections, pendingSowSelections, transport, setPlowError, setSowError, isInteractive])

  const updateBakeExchangeCount = (id: string, delta: number) => {
    if (!bakeExchangePlayer) return
    setBakeExchangeCounts((prev) => {
      const current = prev[id] ?? 0
      const maxUse = bakeExchangeInfo[id]?.max ?? 0
      const totalSelected = Object.values(prev).reduce(
        (sum, value) => sum + value,
        0,
      )
      const availableGrain = bakeExchangePlayer.resources.grain
      const remaining = Math.max(0, availableGrain - totalSelected)
      const limit = Math.min(maxUse, current + remaining)
      const nextValue = Math.max(0, Math.min(current + delta, limit))
      if (nextValue === current) return prev
      return { ...prev, [id]: nextValue }
    })
  }

  const confirmBakeExchange = () => {
    if (!pendingChoice || !isBakeExchange) return
    const entries = Object.entries(bakeExchangeCounts)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => `${id}=${count}`)
    if (entries.length === 0) {
      resolveChoice('cancel')
      return
    }
    resolveChoice(`bulk:${entries.join(',')}`)
  }

  const confirmNextPlayer = useCallback(() => {
    if (!isInteractive) return
    void transport.confirmNextPlayer().catch((e) => console.error(e))
  }, [transport, isInteractive])
  const confirmPlayerSwitch = useCallback(() => {
    if (!isInteractive) return
    void transport.confirmPlayerSwitch().catch((e) => console.error(e))
  }, [transport, isInteractive])
  const confirmAnimalReorg = useCallback(() => {
    if (!isInteractive) return
    if (pending.type !== 'animalReorg' || !animalReorg) return
    void transport.confirmReorg(pending.playerIndex, animalReorg.zones).catch((e) => console.error(e))
  }, [pending, animalReorg, transport, isInteractive])
  const resetGame = useCallback(() => {
    if (!isInteractive) return
    const seed = resetSeedInput ? Number(resetSeedInput) : undefined
    void transport.newGame(Number.isFinite(seed) ? seed : undefined).catch((e) => console.error(e))
  }, [transport, isInteractive, resetSeedInput])

  const pendingChoice =
    interaction.stateId === 'choice' || interaction.stateId === 'farmSelect'
      ? {
          promptKey: interaction.promptKey,
          promptParams: interaction.promptParams,
          options: interaction.options,
          playerIndex: interaction.playerIndex,
          spaceId: interaction.spaceId,
          fenceExtraWood:
            interaction.stateId === 'farmSelect' && interaction.farm.farmType === 'fence'
              ? interaction.farm.extraWood ?? 0
              : undefined,
        }
      : null
  const pendingNextPlayerIndex =
    interaction.stateId === 'confirmNextPlayer' ? interaction.nextPlayerIndex : null
  const pendingPlayerSwitch =
    interaction.stateId === 'confirmPlayerSwitch'
      ? {
          fromPlayerIndex: interaction.fromPlayerIndex,
          toPlayerIndex: interaction.toPlayerIndex,
        }
      : null
  const pendingAnimalReorg =
    interaction.stateId === 'animalReorg'
      ? { playerIndex: interaction.playerIndex, spaceId: interaction.spaceId }
      : null
  const harvestPending =
    interaction.stateId === 'harvestFeed' && state
      ? {
          playerIndex: interaction.playerIndex,
          playerName: state.players[interaction.playerIndex]?.name ?? '',
          remaining: interaction.remaining,
          foodUsed: interaction.foodUsed,
        }
      : null
  const allWorkersUsed = state?.players.every((p) => p.workersAvailable <= 0) ?? false

  const canTakeActionForBoard = useCallback((space: ActionSpace, _player: PlayerState) => {
    if (!state || !currentPlayer || !isInteractive) return false
    if (interaction.stateId !== 'idle') return false
    return actionAvailability[space.id] === true
  }, [state, currentPlayer, interaction.stateId, isInteractive, actionAvailability])

  const actionMap = useMemo(() => {
    if (!state) return new Map<string, ActionSpace>()
    return new Map(state.actionSpaces.map((s) => [s.id, s]))
  }, [state?.actionSpaces])
  const roundSlots: RoundSlot[] = useMemo(() => {
    if (!state) return []
    return state.roundActionOrder.map((id, index) => {
      const action = id ? actionMap.get(id) : undefined
      return {
        round: index + 1,
        action: action ?? undefined,
      }
    })
  }, [state?.roundActionOrder, actionMap])
  const baseActions = useMemo(() => {
    if (!state) return []
    const roundIds = new Set(state.roundActionOrder.filter(Boolean))
    return state.actionSpaces.filter((space) => !roundIds.has(space.id))
  }, [state])

  const playedCards = displayPlayer?.playedCards ?? [
    ...(displayPlayer?.improvements ?? []).map((id: string) => `major:${id}`),
    ...(displayPlayer?.minorPlayed ?? []).map((id: string) => `minor:${id}`),
    ...(displayPlayer?.occupationPlayed ?? []).map((id: string) => `occupation:${id}`),
  ]

  const isSelectingFences = pendingChoice?.promptKey === 'ui.interactionFenceSelect'
  const isSelectingStables = pendingChoice?.promptKey === 'ui.interactionStableSelect'
  const isSelectingRooms = pendingChoice?.promptKey === 'ui.interactionRoomSelect'
  const isSelectingPlow = pendingChoice?.promptKey === 'ui.interactionPlowSelect'
  const isSelectingSow = pendingChoice?.promptKey === 'ui.interactionSowSelect'
  const isSelectingMinor = pendingChoice?.promptKey === 'ui.interactionChooseMinorImprovement' || pendingChoice?.promptKey === 'ui.interactionChooseImprovement'
  const isSelectingOccupation = pendingChoice?.promptKey === 'ui.interactionChooseOccupation'
  const isSelectingImprovementAny = pendingChoice?.promptKey === 'ui.interactionChooseImprovement'
  const selectableMinorIds = useMemo(() => {
    if (!pendingChoice || !isSelectingMinor) return new Set<string>()
    return new Set(
      pendingChoice.options
        .map((option) =>
          option.value.startsWith('minor:') ? option.value.slice('minor:'.length) : option.value,
        )
        .filter((value) => !value.startsWith('major:')),
    )
  }, [pendingChoice, isSelectingMinor])
  const selectableOccupationIds = useMemo(() => {
    if (!pendingChoice || !isSelectingOccupation) return new Set<string>()
    return new Set(pendingChoice.options.map((option) => option.value))
  }, [pendingChoice, isSelectingOccupation])
  const selectableMajorIds = useMemo(() => {
    if (!pendingChoice || !isSelectingImprovementAny) return new Set<string>()
    return new Set(
      pendingChoice.options
        .map((option) =>
          option.value.startsWith('major:') ? option.value.slice('major:'.length) : option.value,
        )
        .filter((value) => state?.availableMajorImprovements.includes(value)),
    )
  }, [pendingChoice, isSelectingImprovementAny, state?.availableMajorImprovements])

  const bakeExchangeInfo = useMemo<Record<string, { food: number; max: number }>>(
    () => ({
      Major_Fireplace1: { food: 2, max: Number.POSITIVE_INFINITY },
      Major_Fireplace2: { food: 2, max: Number.POSITIVE_INFINITY },
      Major_CookingHearth1: { food: 3, max: Number.POSITIVE_INFINITY },
      Major_CookingHearth2: { food: 3, max: Number.POSITIVE_INFINITY },
      Major_ClayOven: { food: 5, max: 1 },
      Major_StoneOven: { food: 4, max: 2 },
    }),
    [],
  )
  const cardLabel = (id: string) =>
    t(locale, `improvements.${id}.name`).replace(/\s*[（(].*$/, '')

  const isBakeExchange =
    pendingChoice?.promptKey === 'ui.interactionBakeBreadChoice'
  const bakeExchangePlayer =
    isBakeExchange && pendingChoice && state
      ? state.players[pendingChoice.playerIndex]
      : null
  const bakeExchangeOptions = useMemo(
    () =>
      isBakeExchange
        ? (pendingChoice?.options ?? []).filter(
            (option) => !!bakeExchangeInfo[option.value],
          )
        : [],
    [isBakeExchange, pendingChoice?.options, bakeExchangeInfo],
  )
  const bakeExchangeOptionIds = useMemo(
    () => bakeExchangeOptions.map((option) => option.value),
    [bakeExchangeOptions],
  )
  const bakeExchangeKey = useMemo(
    () => bakeExchangeOptionIds.join('|'),
    [bakeExchangeOptionIds],
  )
  const bakeExchangeKeyRef = useRef('')

  useEffect(() => {
    if (!isBakeExchange || bakeExchangeOptionIds.length === 0) {
      if (Object.keys(bakeExchangeCounts).length > 0) {
        setBakeExchangeCounts({})
      }
      bakeExchangeKeyRef.current = ''
      return
    }
    if (bakeExchangeKeyRef.current === bakeExchangeKey) return
    const nextCounts: Record<string, number> = {}
    bakeExchangeOptionIds.forEach((value) => {
      nextCounts[value] = 0
    })
    bakeExchangeKeyRef.current = bakeExchangeKey
    setBakeExchangeCounts(nextCounts)
  }, [
    isBakeExchange,
    bakeExchangeKey,
    bakeExchangeOptionIds,
    bakeExchangeCounts,
  ])

  const bakeTotalGrain = Object.values(bakeExchangeCounts).reduce(
    (sum, value) => sum + value,
    0,
  )
  const bakeTotalFood = Object.entries(bakeExchangeCounts).reduce(
    (sum, [id, count]) =>
      sum + (bakeExchangeInfo[id]?.food ?? 0) * count,
    0,
  )
  const baseFood = bakeExchangePlayer?.resources.food ?? 0
  const baseGrain = bakeExchangePlayer?.resources.grain ?? 0
  const summaryResources = {
    ...emptyResources,
    food: baseFood + bakeTotalFood,
    grain: Math.max(0, baseGrain - bakeTotalGrain),
  }
  const hasBakeSummary =
    summaryResources.food > 0 || summaryResources.grain > 0

  const isHarvestFeedExchange = interaction.stateId === 'harvestFeed'
  const harvestFeedPlayer =
    isHarvestFeedExchange && state
      ? state.players[interaction.playerIndex] ?? null
      : null
  const harvestFeedOptions = useMemo(
    () =>
      harvestFeedPlayer
        ? buildHarvestFeedOptions(harvestFeedPlayer, locale, cardLabel)
        : [],
    [harvestFeedPlayer, locale],
  )
  const harvestFeedOptionIds = useMemo(
    () => harvestFeedOptions.map((option) => option.id),
    [harvestFeedOptions],
  )
  const harvestFeedKey = useMemo(
    () => harvestFeedOptionIds.join('|'),
    [harvestFeedOptionIds],
  )
  const harvestFeedKeyRef = useRef('')

  useEffect(() => {
    if (!isHarvestFeedExchange || harvestFeedOptionIds.length === 0) {
      if (Object.keys(harvestFeedCounts).length > 0) {
        setHarvestFeedCounts({})
      }
      harvestFeedKeyRef.current = ''
      return
    }
    if (harvestFeedKeyRef.current === harvestFeedKey) return
    const nextCounts: Record<string, number> = {}
    harvestFeedOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    harvestFeedKeyRef.current = harvestFeedKey
    setHarvestFeedCounts(nextCounts)
  }, [
    harvestFeedCounts,
    harvestFeedKey,
    harvestFeedOptionIds,
    isHarvestFeedExchange,
  ])

  const getHarvestFeedUsageByResource = useCallback((counts: Record<string, number>) => {
    const usage: Partial<Record<keyof Resource, number>> = {}
    harvestFeedOptions.forEach((option) => {
      const count = counts[option.id] ?? 0
      if (count <= 0) return
      usage[option.resourceKey] = (usage[option.resourceKey] ?? 0) + count
    })
    return usage
  }, [harvestFeedOptions])

  const updateHarvestFeedCount = useCallback((id: string, delta: number) => {
    setHarvestFeedCounts((prev) => {
      const current = prev[id] ?? 0
      const option = harvestFeedOptions.find((entry) => entry.id === id)
      if (!option || !harvestFeedPlayer) return prev
      const usage = getHarvestFeedUsageByResource(prev)
      const available = harvestFeedPlayer.resources[option.resourceKey]
      const usedByResource = usage[option.resourceKey] ?? 0
      const max = current + Math.max(0, available - usedByResource)
      const nextValue = Math.max(0, Math.min(current + delta, max))
      if (nextValue === current) return prev
      return { ...prev, [id]: nextValue }
    })
  }, [getHarvestFeedUsageByResource, harvestFeedOptions, harvestFeedPlayer])

  const resetHarvestFeedCounts = useCallback(() => {
    const nextCounts: Record<string, number> = {}
    harvestFeedOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setHarvestFeedCounts(nextCounts)
  }, [harvestFeedOptionIds])

  const harvestFeedSelections = useMemo(
    () =>
      harvestFeedOptions
        .map((option) => ({
          resourceKey: option.resourceKey,
          count: harvestFeedCounts[option.id] ?? 0,
          food: option.food,
          sourceName: option.sourceName,
        }))
        .filter((entry) => entry.count > 0),
    [harvestFeedCounts, harvestFeedOptions],
  )
  const harvestFeedConvertedFood = useMemo(
    () =>
      harvestFeedSelections.reduce((sum, entry) => sum + entry.count * entry.food, 0),
    [harvestFeedSelections],
  )
  const harvestFeedBegging = Math.max(
    0,
    (harvestPending?.remaining ?? 0) - harvestFeedConvertedFood,
  )
  const harvestFeedSummary = useMemo(() => {
    const resources = { ...emptyResources }
    resources.food = (harvestPending?.foodUsed ?? 0) + harvestFeedConvertedFood
    harvestFeedSelections.forEach((entry) => {
      resources[entry.resourceKey] = (resources[entry.resourceKey] ?? 0) + entry.count
    })
    resources.begging = harvestFeedBegging
    return resources
  }, [harvestFeedBegging, harvestFeedConvertedFood, harvestFeedSelections, harvestPending?.foodUsed])
  const hasHarvestFeedSummary = Object.values(harvestFeedSummary).some((value) => value > 0)
  const confirmHarvestFeed = useCallback(() => {
    if (!isInteractive) return
    if (pending.type !== 'harvestFeed') return
    void transport.confirmFeed(pending.playerIndex, harvestFeedSelections).catch((e) => console.error(e))
  }, [pending, transport, isInteractive, harvestFeedSelections])

  const roomPositions = useMemo(() => new Set((displayPlayer?.roomTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos))), [displayPlayer?.roomTiles])
  const fieldPositions = useMemo(() => new Set((displayPlayer?.fields ?? []).map((f) => positionKey({ row: f.row, col: f.col }))), [displayPlayer?.fields])
  const fieldMap = useMemo(() => {
    const map = new Map<string, { crop: 'grain' | 'vegetable' | null; remaining: number }>()
    ;(displayPlayer?.fields ?? []).forEach((f) => { map.set(positionKey({ row: f.row, col: f.col }), { crop: f.crop, remaining: f.remaining }) })
    return map
  }, [displayPlayer?.fields])
  const stablePositions = useMemo(() => new Set((displayPlayer?.stableTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos))), [displayPlayer?.stableTiles])
  const existingFenceSet = useMemo(() => new Set(displayPlayer?.fenceSegments ?? []), [displayPlayer?.fenceSegments])
  const pendingFenceSet = useMemo(() => new Set(pendingFenceEdges), [pendingFenceEdges])

  const farmInteraction =
    interaction.stateId === 'farmSelect' ? interaction.farm : null

  const maxRoomSelections = useMemo(
    () => (farmInteraction?.farmType === 'room' ? farmInteraction.maxSelections : 0),
    [farmInteraction],
  )

  const resetBakeExchangeCounts = () => {
    const nextCounts: Record<string, number> = {}
    bakeExchangeOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setBakeExchangeCounts(nextCounts)
  }

  const maxStableSelections = useMemo(
    () => (farmInteraction?.farmType === 'stable' ? farmInteraction.maxSelections : 0),
    [farmInteraction],
  )
  const maxSowSelections = useMemo(
    () => (farmInteraction?.farmType === 'sow' ? farmInteraction.maxSelections : undefined),
    [farmInteraction],
  )
  const maxFieldSelections = useMemo(
    () => (farmInteraction?.farmType === 'field-select' ? farmInteraction.maxSelections : 0),
    [farmInteraction],
  )
  const sowSelectedCount = Object.keys(pendingSowSelections).length
  const fenceErrorText: string | null = fenceError ? t(locale, `fence.error.${fenceError.code}`) : null
  const roomErrorText: string | null = roomError ? (typeof roomError === 'string' ? roomError : '') : null
  const stableErrorText: string | null = stableError ? (typeof stableError === 'string' ? stableError : '') : null
  const plowErrorText: string | null = plowError ? (typeof plowError === 'string' ? plowError : '') : null
  const sowErrorText: string | null = sowError ? (typeof sowError === 'string' ? sowError : '') : null
  const farmCells = useMemo(() => {
    const rows = 7; const cols = 11
    const cells: { key: string; type: 'tile' | 'post' | 'fence-h' | 'fence-v'; tileRow?: number; tileCol?: number; fenceId?: string }[] = []
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const isTile = row % 2 === 1 && col % 2 === 1
      const isPost = row % 2 === 0 && col % 2 === 0
      const isFenceH = row % 2 === 0 && col % 2 === 1
      const isFenceV = row % 2 === 1 && col % 2 === 0
      cells.push({
        key: `${row}-${col}`, type: isTile ? 'tile' : isPost ? 'post' : isFenceH ? 'fence-h' : 'fence-v',
        tileRow: isTile ? (row - 1) / 2 : undefined, tileCol: isTile ? (col - 1) / 2 : undefined,
        fenceId: isFenceH ? `H-${row / 2}-${(col - 1) / 2}` : isFenceV ? `V-${(row - 1) / 2}-${col / 2}` : undefined,
      })
    }
    return cells
  }, [])

  const pastureTiles = useMemo(() => {
    const map = new Map<string, { pastureId: string; isCorner: boolean }>()
    ;(displayPlayer?.pastures ?? []).forEach((pasture) => {
      if (!pasture.tiles || pasture.tiles.length === 0) return
      let corner = pasture.tiles[0]
      pasture.tiles.forEach((tile) => {
        if (tile.row > corner.row || (tile.row === corner.row && tile.col > corner.col)) corner = tile
      })
      const cornerKey = positionKey(corner)
      pasture.tiles.forEach((tile) => {
        map.set(positionKey(tile), { pastureId: pasture.id, isCorner: positionKey(tile) === cornerKey })
      })
    })
    return map
  }, [displayPlayer?.pastures])
  const pastureDisplayMap = useMemo(() => {
    const map = new Map<string, { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }>()
    ;(displayPlayer?.pastures ?? []).forEach((p) => { if (p.tiles.length > 0) map.set(positionKey(p.tiles[0]), { animalType: p.animalType, animalCount: p.animalCount }) })
    return map
  }, [displayPlayer?.pastures])
  const pastureCapacityMap = useMemo(() => {
    const map = new Map<string, number>()
    ;(displayPlayer?.pastures ?? []).forEach((p) => {
      if (p.tiles.length > 0) {
        map.set(p.id, pastureCapacities[displayPlayer?.id ?? '']?.[p.id] ?? 0)
      }
    })
    return map
  }, [displayPlayer?.pastures, displayPlayer?.id, pastureCapacities])
  const isReorgActive = !!animalReorg

  const houseDisplay = useMemo(() => {
    if (isReorgActive && animalReorg) {
      const zone = animalReorg.zones.find((entry) => entry.zoneType === 'house')
      return {
        animalType: zone?.animalType ?? null,
        animalCount: zone?.animalCount ?? 0,
      }
    }
    return { 
      animalType: (displayPlayer?.houseAnimalType ?? null) as 'sheep' | 'boar' | 'cattle' | null, 
      animalCount: displayPlayer?.houseAnimalCount ?? 0 
    }
  }, [displayPlayer?.houseAnimalType, displayPlayer?.houseAnimalCount, isReorgActive, animalReorg])
  const stableDisplayMap = useMemo(() => {
    const map = new Map<string, { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }>()
    Object.entries(displayPlayer?.stableAnimals ?? {}).forEach(([key, type]) => { map.set(key, { animalType: type as 'sheep' | 'boar' | 'cattle' | null, animalCount: type ? 1 : 0 }) })
    return map
  }, [displayPlayer?.stableAnimals])

  const reorgAvailable = useMemo(() => {
    if (!state) return null
    // 使用本地 animalReorg 状态或 pendingAnimalReorg
    const playerIndex = pendingAnimalReorg?.playerIndex ?? state.currentPlayerIndex
    const player = state.players[playerIndex]
    return player ? { sheep: player.resources.sheep, boar: player.resources.boar, cattle: player.resources.cattle } : null
  }, [pendingAnimalReorg, state])
  const reorgTotals = useMemo(() => {
    if (!animalReorg) return { sheep: 0, boar: 0, cattle: 0 }
    return animalReorg.zones.reduce((acc, z) => { if (z.animalType) acc[z.animalType] += z.animalCount; return acc }, { sheep: 0, boar: 0, cattle: 0 })
  }, [animalReorg])
  void [reorgAvailable, reorgTotals]
  const hasReorgOverflow = useMemo(() => {
    if (!reorgAvailable) return false
    return reorgTotals.sheep > reorgAvailable.sheep || reorgTotals.boar > reorgAvailable.boar || reorgTotals.cattle > reorgAvailable.cattle
  }, [reorgAvailable, reorgTotals])
  const reorgRemaining = reorgAvailable ? {
    sheep: Math.max(0, reorgAvailable.sheep - reorgTotals.sheep),
    boar: Math.max(0, reorgAvailable.boar - reorgTotals.boar),
    cattle: Math.max(0, reorgAvailable.cattle - reorgTotals.cattle),
  } : null
  const roomSelectableSet = useMemo(
    () =>
      new Set(
        farmInteraction?.farmType === 'room'
          ? farmInteraction.selectableTiles.map((tile) => positionKey(tile))
          : [],
      ),
    [farmInteraction],
  )
  const stableSelectableSet = useMemo(
    () =>
      new Set(
        farmInteraction?.farmType === 'stable'
          ? farmInteraction.selectableTiles.map((tile) => positionKey(tile))
          : [],
      ),
    [farmInteraction],
  )
  const fenceSelectableSet = useMemo(
    () =>
      new Set(
        farmInteraction?.farmType === 'fence'
          ? farmInteraction.selectableEdges
          : [],
      ),
    [farmInteraction],
  )
  const fieldSelectableSet = useMemo(
    () =>
      new Set(
        farmInteraction?.farmType === 'field-select'
          ? farmInteraction.selectableFields.map((tile) => positionKey(tile))
          : [],
      ),
    [farmInteraction],
  )
  const sowSelectableMap = useMemo(() => {
    const map = new Map<string, ('grain' | 'vegetable')[]>()
    if (farmInteraction?.farmType !== 'sow') return map
    farmInteraction.selectableFields.forEach((entry) => {
      map.set(positionKey(entry.tile), entry.allowedCrops)
    })
    return map
  }, [farmInteraction])
  const wrappedToggleRoom = (tile: FarmTilePosition) =>
    toggleRoomTileInternal(tile, maxRoomSelections, positionKey)
  const wrappedToggleStable = (tile: FarmTilePosition) =>
    toggleStableTileInternal(tile, maxStableSelections, positionKey)
  const wrappedTogglePlow = (tile: FarmTilePosition) =>
    togglePlowTileInternal(tile, positionKey)
  const wrappedUpdateSow = (tile: FarmTilePosition, value: string) =>
    updateSowSelectionInternal(tile, value, maxSowSelections, positionKey)
  const wrappedToggleFieldSelection = (tile: FarmTilePosition) =>
    toggleFieldSelectionInternal(tile, maxFieldSelections, positionKey)
  const setViewPlayerIdSafe = useCallback((value: string) => {
    setViewPlayerId(value)
  }, [])

  const adjustReorgAnimal = (zoneId: string, animalType: 'sheep' | 'boar' | 'cattle', delta: number) => {
    setAnimalReorg((prev) => {
      if (!prev || !pendingAnimalReorg || !state) return prev
      const player = state.players[pendingAnimalReorg.playerIndex]
      if (!player) return prev
      
      let capacity = 0
      const current = prev.zones.find((zone) => zone.id === zoneId)
      if (!current) return prev
      capacity = current.capacity

      const totals = prev.zones.reduce(
        (acc, zone) => {
          if (!zone.animalType) return acc
          acc[zone.animalType] += zone.animalCount
          return acc
        },
        { sheep: 0, boar: 0, cattle: 0 },
      )

      const available = {
        sheep: player.resources.sheep,
        boar: player.resources.boar,
        cattle: player.resources.cattle,
      }

      if (delta > 0) {
        const baseTotals = { ...totals }
        if (current.animalType) {
          baseTotals[current.animalType] -= current.animalCount
        }
        const remaining = available[animalType] - baseTotals[animalType]
        if (remaining <= 0) return prev

        const nextCount =
          current.animalType === animalType
            ? Math.min(capacity, current.animalCount + 1)
            : Math.min(capacity, 1)

        if (nextCount <= 0) return prev

        const zones = prev.zones.map((zone) => {
          if (zone.id !== zoneId) return zone
          return {
            ...zone,
            animalType,
            animalCount: nextCount,
          }
        })
        return { ...prev, zones, confirmDiscard: false }
      }

      if (current.animalType !== animalType || current.animalCount <= 0) {
        return prev
      }
      const nextCount = Math.max(0, current.animalCount - 1)
      const zones = prev.zones.map((zone) => {
        if (zone.id !== zoneId) return zone
        return {
          ...zone,
          animalType: nextCount > 0 ? animalType : null,
          animalCount: nextCount,
        }
      })
      return { ...prev, zones, confirmDiscard: false }
    })
  }
  const cancelAnimalDiscardPrompt = () => { setAnimalReorg((prev) => prev ? { ...prev, confirmDiscard: false } : prev) }
  const plowSelectableSet = useMemo(
    () =>
      new Set(
        farmInteraction?.farmType === 'plow'
          ? farmInteraction.selectableTiles.map((tile) => positionKey(tile))
          : [],
      ),
    [farmInteraction],
  )
  const sowRemaining = useMemo(() => ({
    grain: Math.max(0, (displayPlayer?.resources.grain ?? 0) - Object.values(pendingSowSelections).filter((v) => v === 'grain').length),
    vegetable: Math.max(0, (displayPlayer?.resources.vegetable ?? 0) - Object.values(pendingSowSelections).filter((v) => v === 'vegetable').length),
  }), [displayPlayer?.resources, pendingSowSelections])
  const futureCardResources = useMemo(() => {
    if (!state) return {}
    const rec: Record<string, { playerId: string; name: string; color: 'red' | 'yellow' | 'blue' | 'black'; resources: Partial<Resource> }[]> = {}
    state.futureMeeples.forEach((fm) => {
      if (fm.round > state.round) {
        const key = fm.actionId ?? fm.cardId
        if (!rec[key]) rec[key] = []
        const player = state.players.find((p) => p.id === fm.playerId)
        rec[key].push({ playerId: fm.playerId, name: player?.name ?? '', color: (player?.color ?? 'red') as 'red' | 'yellow' | 'blue' | 'black', resources: fm.resources })
      }
    })
    return rec
  }, [state])

  const resourceKeys = resourceKeyList

  const applyDevResource = useCallback(async () => {
    if (!devPlayerId || !state) return
    const clone = JSON.parse(JSON.stringify(state)) as import('../../shared/game/types').GameState
    const player = clone.players.find((p) => p.id === devPlayerId)
    if (!player) return
    const delta = Number(devAmount ?? 0)
    player.resources[devResource] = Math.max(0, (player.resources[devResource] ?? 0) + delta)
    
    await transport.loadGame(clone)
    
  }, [devPlayerId, devResource, devAmount, state, transport])

  const applyDevRound = useCallback(() => {
    if (!state || !Number.isFinite(devRound)) return
    void transport.loadGame({ ...state, round: Math.max(1, Math.min(14, Math.floor(devRound))) }).catch((e) => console.error('applyDevRound error', e))
  }, [state, devRound, transport])

  const stripCardId = (id: string) => id.trim()

  const playDevCard = useCallback(async () => {
    if (!state || !devPlayerId) return
    const cardId = stripCardId(devCardId)
    if (!cardId) return
    const playerIndex = state.players.findIndex((p) => p.id === devPlayerId)
    if (playerIndex < 0) return
    try {
      const data = await transport.devPlayCard(playerIndex, cardId)
      if (!data.ok) {
        console.error('playDevCard failed:', data.error)
      }
    } catch (e) {
      console.error('playDevCard error', e)
    }
  }, [state, devPlayerId, devCardId, transport])

  const drawDevCard = useCallback(async () => {
    if (!state || !devPlayerId) return
    const cardId = stripCardId(devCardId)
    if (!cardId) return
    const playerIndex = state.players.findIndex((p) => p.id === devPlayerId)
    if (playerIndex < 0) return
    try {
      const data = await transport.devDrawCard(playerIndex, cardId)
      if (!data.ok) {
        console.error('drawDevCard failed:', data.error)
      }
    } catch (e) {
      console.error('drawDevCard error', e)
    }
  }, [state, devPlayerId, devCardId, transport])

  const createDevPasture = useCallback(async () => {
    if (!state || !isInteractive || !devPlayerId) return
    const playerIndex = state.currentPlayerIndex
    const current = state.players[playerIndex]
    if (!current || current.id !== devPlayerId) return
    const clone = JSON.parse(JSON.stringify(state)) as import('../../shared/game/types').GameState
    const cp = clone.players.find((p) => p.id === devPlayerId)
    if (!cp) return
    cp.resources.wood = Math.max(0, 6)
    await transport.loadGame(clone)
    await transport.devCreatePasture(playerIndex)
  }, [state, isInteractive, devPlayerId, transport])

  const saveDevState = useCallback(() => {
    if (!state) return
    const payload = JSON.stringify(state, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `open-agricola-round-${state.round}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [state])

  const loadDevState = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (!result) return
      const raw = JSON.parse(String(result)) as import('../../shared/game/types').GameState
      void transport.loadGame(raw).catch((e) => console.error('loadDevState error', e))
    }
    reader.readAsText(file)
  }, [transport])

  if (isWs && wsStatus.phase !== 'ready' && !state) {
    const statusText = wsStatus.phase === 'idle' ? t(locale, 'platform.loading')
      : wsStatus.phase === 'connecting' ? t(locale, 'platform.loading')
      : wsStatus.phase === 'creating' ? t(locale, 'platform.loading')
      : wsStatus.phase === 'joining' ? t(locale, 'platform.loading')
      : wsStatus.phase === 'waiting' ? t(locale, 'platform.waitingForPlayers', { roomId: wsStatus.roomId, current: String(wsStatus.players.length), max: String(wsStatus.maxPlayers) })
      : wsStatus.phase === 'error' ? (wsStatus.message === 'roomDissolved' ? t(locale, 'platform.roomDissolved') : `Error: ${wsStatus.message}`)
      : t(locale, 'platform.loading')

    const inviteUrl = wsStatus.phase === 'waiting'
      ? `${window.location.origin}${window.location.pathname}?page=game&transport=ws&room=${wsStatus.roomId}`
      : null

    const handleDissolve = () => {
      if (!wsTransport) return
      if (!window.confirm(t(locale, 'platform.dissolveConfirm'))) return
      wsTransport.sendRoomCommand('dissolveRoom')
      setPage('lobby')
    }

    return (
      <div className="ws-status-screen">
        <div className="ws-status-card">
          <BrandMark
            title="Open Agricola"
            titleAs="h2"
            className="brand-mark-centered ws-status-brand"
            titleClassName="ws-status-title"
          />
          <div className="ws-status-text">{statusText}</div>

          {wsStatus.phase === 'waiting' && inviteUrl && (
            <div className="ws-invite-panel">
              <div className="ws-invite-label">{t(locale, 'platform.inviteLabel')}</div>
              <div className="ws-invite-url-row">
                <code className="ws-invite-url">{inviteUrl}</code>
                <button
                  type="button"
                  className="btn-primary ws-btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl).catch(() => {})
                  }}
                >
                  {t(locale, 'platform.copy')}
                </button>
              </div>
              <div className="ws-invite-roomid">{t(locale, 'platform.roomIdLabel')}<strong>{wsStatus.roomId}</strong></div>
              <div className="ws-invite-players">
                {wsStatus.players.map(p => (
                  <div key={p.playerIndex} className="ws-invite-player">
                    {t(locale, 'platform.playerLabel', { index: String(p.playerIndex + 1), name: p.name })}
                  </div>
                ))}
              </div>
              <button type="button" className="btn-danger ws-dissolve-btn" onClick={handleDissolve}>
                {t(locale, 'platform.dissolveRoom')}
              </button>
            </div>
          )}

          {wsStatus.phase === 'error' && (
            <div className="ws-error-actions">
              <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                {t(locale, 'platform.retry')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPage('lobby')}>
                {t(locale, 'platform.backToLobby')}
              </button>
            </div>
          )}

          {(wsStatus.phase === 'connecting' || wsStatus.phase === 'creating' || wsStatus.phase === 'joining') && (
            <div className="ws-spinner" />
          )}

          <button type="button" className="btn-link ws-status-back" onClick={() => setPage('lobby')}>
            {t(locale, 'platform.backToLobby')}
          </button>
        </div>
      </div>
    )
  }

  if (!state || !currentPlayer || !displayPlayer) {
    return <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>Loading...</div>
  }

  return (
    <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
      {isHarvestFeedExchange && harvestPending && harvestFeedOptions.length > 0 && isInteractive ? (
        <div className="exchange-overlay">
          <div className="exchange-modal">
            <div className="exchange-header">
              <div className="exchange-title">
                {t(locale, 'ui.exchangeCenterTitle')}
              </div>
              <div className="exchange-subtitle">
                {t(locale, 'ui.harvestFeedSubtitle', {
                  player: harvestPending.playerName,
                  count: harvestPending.remaining,
                })}
              </div>
            </div>
            <div className="exchange-content">
              <div className="exchange-options">
                {harvestFeedOptions.map((option) => {
                  const current = harvestFeedCounts[option.id] ?? 0
                  const usage = getHarvestFeedUsageByResource(harvestFeedCounts)
                  const available = harvestFeedPlayer?.resources[option.resourceKey] ?? 0
                  const usedByResource = usage[option.resourceKey] ?? 0
                  const limit = current + Math.max(0, available - usedByResource)
                  const canAdd = current < limit
                  const canSubtract = current > 0
                  return (
                    <div key={option.id} className="exchange-row">
                      <div className="exchange-name">{option.sourceName}</div>
                      <div className="exchange-rate">
                        <span className="interaction-resource-exchange">
                          <ResourceLine
                            locale={locale}
                            resources={{
                              ...emptyResources,
                              [option.resourceKey]: 1,
                            }}
                            hideZero
                          />
                          <span className="interaction-resource-exchange-arrow" aria-hidden="true">
                            <span className="res-icon res-icon-arrow" />
                          </span>
                          <ResourceLine
                            locale={locale}
                            resources={{
                              ...emptyResources,
                              food: option.food,
                            }}
                            hideZero
                          />
                        </span>
                      </div>
                      <div className="exchange-steps">
                        <button
                          type="button"
                          className="exchange-step"
                          onClick={() => updateHarvestFeedCount(option.id, -1)}
                          disabled={!canSubtract}
                        >
                          -
                        </button>
                        <div className="exchange-count">{current}</div>
                        <button
                          type="button"
                          className="exchange-step"
                          onClick={() => updateHarvestFeedCount(option.id, 1)}
                          disabled={!canAdd}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="exchange-footer">
                <div className="exchange-summary">
                  <div className="interaction-subtitle">
                    {t(locale, 'ui.harvestFeedProgress', {
                      fed: (harvestPending.foodUsed ?? 0) + harvestFeedConvertedFood,
                      required: (harvestPending.foodUsed ?? 0) + harvestPending.remaining,
                      begging: harvestFeedBegging,
                    })}
                  </div>
                  {hasHarvestFeedSummary ? (
                    <ResourceLine
                      locale={locale}
                      resources={harvestFeedSummary}
                      emptyLabel={t(locale, 'ui.noResources')}
                    />
                  ) : (
                    t(locale, 'ui.noResources')
                  )}
                </div>
                <div className="exchange-actions">
                  <button
                    type="button"
                    className="exchange-cancel"
                    onClick={resetHarvestFeedCounts}
                  >
                    {t(locale, 'ui.exchangeReset')}
                  </button>
                  <button
                    type="button"
                    className="exchange-confirm"
                    onClick={confirmHarvestFeed}
                  >
                    {t(locale, 'ui.interactionConfirmButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isBakeExchange && pendingChoice ? (
        <div className="exchange-overlay">
          <div className="exchange-modal">
            <div className="exchange-header">
              <div className="exchange-title">
                {t(locale, 'ui.bakeBreadTitle')}
              </div>
              <div className="exchange-subtitle">
                {t(locale, pendingChoice.promptKey ?? 'ui.interactionChooseOne')}
              </div>
            </div>
            <div className="exchange-content">
              <div className="exchange-options">
                {bakeExchangeOptions.map((option) => {
                  const info = bakeExchangeInfo[option.value] ?? {
                    food: 0,
                    max: 0,
                  }
                  const current = bakeExchangeCounts[option.value] ?? 0
                  const availableGrain = bakeExchangePlayer?.resources.grain ?? 0
                  const remaining = Math.max(0, availableGrain - bakeTotalGrain)
                  const limit = Math.min(info.max, current + remaining)
                  const canAdd =
                    availableGrain > bakeTotalGrain && current < limit
                  const canSubtract = current > 0
                  const rateText = Number.isFinite(info.max)
                    ? t(locale, 'ui.bakeBreadRateLimited', {
                        max: info.max,
                        food: info.food,
                      })
                    : t(locale, 'ui.bakeBreadRate', { food: info.food })
                  return (
                    <div key={option.value} className="exchange-row">
                      <div className="exchange-name">
                        {cardLabel(option.value)}
                      </div>
                      <div className="exchange-rate">{rateText}</div>
                      <div className="exchange-steps">
                        <button
                          type="button"
                          className="exchange-step"
                          onClick={() => updateBakeExchangeCount(option.value, -1)}
                          disabled={!canSubtract}
                        >
                          -
                        </button>
                        <div className="exchange-count">{current}</div>
                        <button
                          type="button"
                          className="exchange-step"
                          onClick={() => updateBakeExchangeCount(option.value, 1)}
                          disabled={!canAdd}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="exchange-footer">
                <div className="exchange-summary">
                {hasBakeSummary ? (
                  <ResourceLine
                    locale={locale}
                    resources={summaryResources}
                    emptyLabel={t(locale, 'ui.noResources')}
                  />
                ) : (
                  t(locale, 'ui.noResources')
                )}
                </div>
                <div className="exchange-actions">
                  <button
                    type="button"
                    className="exchange-cancel"
                    onClick={resetBakeExchangeCounts}
                  >
                    {t(locale, 'ui.exchangeReset')}
                  </button>
                  <button
                    type="button"
                    className="exchange-confirm"
                    onClick={confirmBakeExchange}
                  >
                    {t(locale, 'ui.interactionConfirmButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showScoringPad ? <ScoringPad locale={locale} scores={scores ?? []} onClose={() => setShowScoringPad(false)} /> : null}
      {devMode && isInteractive ? (
        <DevPanel
          locale={locale} players={state.players}
          devPlayerId={devPlayerId} devResource={devResource} devAmount={devAmount} devRound={devRound}
          resourceKeys={resourceKeys}
          setDevPlayerId={setDevPlayerId} setDevResource={setDevResource} setDevAmount={setDevAmount} setDevRound={setDevRound}
          applyDevResource={applyDevResource} applyDevRound={applyDevRound}
          devCardId={devCardId} setDevCardId={setDevCardId}
          playDevCard={playDevCard} drawDevCard={drawDevCard}
          createDevPasture={createDevPasture}
          saveDevState={saveDevState} loadDevState={loadDevState}
          isInteractive={isInteractive}
          seedValue={resetSeedInput} onSeedChange={setResetSeedInput} onResetGame={resetGame}
        />
      ) : null}

      <GameHeader locale={locale} state={state} currentPlayer={currentPlayer} allWorkersUsed={allWorkersUsed} devMode={devMode} setDevMode={setDevMode} myPlayerName={selfPlayer?.name ?? null} isMyTurn={isMyTurn}
        onUndo={undoStep} onUndoAction={undoAction} onShowScoring={() => setShowScoringPad(true)} historyLength={historyLength} hasActionStartSnapshot={hasActionStartSnapshot} isInteractive={isInteractive}
      />

      <AnytimeBar
        anytimeActions={interaction.anytimeActions}
        locale={locale}
        isInteractive={isInteractive}
        takeAnytimeAction={takeAnytimeAction}
      />

      <MajorImprovements locale={locale} availableMajorImprovements={state.availableMajorImprovements} isSelectingMajor={isSelectingImprovementAny} selectableMajorIds={selectableMajorIds} cardAvailability={cardAvailability} resolveChoice={resolveChoice} futureCardResources={futureCardResources} isInteractive={isInteractive} devMode={devMode} />

      <main className="board">
        <section className="board-panel board-action">
          <ActionBoard locale={locale} baseActions={baseActions} roundSlots={roundSlots} currentPlayer={currentPlayer} players={state.players} futureMeeples={state.futureMeeples} canTakeAction={canTakeActionForBoard} takeAction={takeAction} currentRound={state.round} devMode={devMode} />
        </section>
        <section className="board-panel board-farm">
          <FarmBoard locale={locale} players={state.players} currentPlayer={currentPlayer} displayPlayer={displayPlayer} devMode={devMode}
            currentStartPlayerId={state.players.find((p) => p.startPlayer)?.id ?? ''}
            nextStartPlayerId={state.players.find((p) => p.startPlayer)?.id ?? ''}
            playedCards={playedCards} farmCells={farmCells} roomPositions={roomPositions} fieldPositions={fieldPositions}
            fieldMap={fieldMap} stablePositions={stablePositions}
            pendingRoomSet={new Set(pendingRoomTiles.map((tp) => positionKey(tp)))}
            pendingStableSet={new Set(pendingStableTiles.map((tp) => positionKey(tp)))}
            roomSelectableSet={roomSelectableSet} stableSelectableSet={stableSelectableSet}
            maxStableSelections={maxStableSelections} plowSelectableSet={plowSelectableSet} pendingPlowTile={pendingPlowTile}
            fieldSelectableSet={fieldSelectableSet} pendingFieldSelections={pendingFieldSelections} toggleFieldSelection={wrappedToggleFieldSelection}
            pendingSowSelections={pendingSowSelections} sowRemaining={sowRemaining} sowSelectableMap={sowSelectableMap} pastureTiles={pastureTiles}
            pastureDisplayMap={pastureDisplayMap} pastureCapacityMap={pastureCapacityMap} houseDisplay={houseDisplay}
            stableDisplayMap={stableDisplayMap} isReorgActive={isReorgActive} reorgRemaining={reorgRemaining}
            hasReorgOverflow={hasReorgOverflow} animalReorg={animalReorg} pendingFenceSet={pendingFenceSet}
            existingFenceSet={existingFenceSet} fenceSelectableSet={fenceSelectableSet}
            toggleRoomTile={wrappedToggleRoom} toggleStableTile={wrappedToggleStable}
            togglePlowTile={wrappedTogglePlow} updateSowSelection={wrappedUpdateSow}
            toggleFenceEdge={toggleFenceEdge} adjustReorgAnimal={adjustReorgAnimal}
            confirmAnimalReorg={confirmAnimalReorg} cancelAnimalDiscardPrompt={cancelAnimalDiscardPrompt}
            setViewPlayerId={setViewPlayerIdSafe} isSelectingMinor={isSelectingMinor} isSelectingOccupation={isSelectingOccupation}
            isSelectingImprovementAny={isSelectingImprovementAny} selectableMinorIds={selectableMinorIds}
            selectableOccupationIds={selectableOccupationIds} cardAvailability={cardAvailability} futureCardResources={futureCardResources} resolveChoice={resolveChoice}
            isInteractive={isInteractive}
          />
        </section>
      </main>

      <LogPanel locale={locale} log={state.log} />

      <InteractionBar
        pendingAnimalReorg={pendingAnimalReorg} pendingChoice={pendingChoice}
        pendingNextPlayerIndex={pendingNextPlayerIndex} locale={locale}
        pendingPlayerSwitch={pendingPlayerSwitch}
        confirmPlayerSwitch={confirmPlayerSwitch}
        playerNames={state.players.map((p) => p.name ?? `Player ${p.id}`)}
        pendingRoomTilesLength={pendingRoomTiles.length} maxRoomSelections={maxRoomSelections}
        pendingStableTilesLength={pendingStableTiles.length} maxStableSelections={maxStableSelections}
        pendingSowSelectionsLength={sowSelectedCount}
        hasPendingPlowSelection={pendingPlowTile !== null}
        pendingFieldSelectionsLength={pendingFieldSelections.size} maxFieldSelections={maxFieldSelections}
        fenceErrorText={fenceErrorText ?? ''} roomErrorText={roomErrorText ?? ''}
        stableErrorText={stableErrorText ?? ''} plowErrorText={plowErrorText ?? ''} sowErrorText={sowErrorText ?? ''}
        isSelectingFences={isSelectingFences} isSelectingRooms={isSelectingRooms}
        isSelectingStables={isSelectingStables} isSelectingPlow={isSelectingPlow} isSelectingSow={isSelectingSow}
        resolveChoice={resolveChoice} confirmNextPlayer={confirmNextPlayer}
        harvestFeedPlayerName={harvestPending?.playerName ?? null} confirmHarvestFeed={confirmHarvestFeed}
        isInteractive={isInteractive}
      />
    </div>
  )
}
