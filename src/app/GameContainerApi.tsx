import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionSpace, FarmTilePosition, PlayerState, Resource } from '../../shared/game/types'
import { t } from '../../shared/i18n'
import type { Locale } from '../../shared/i18n'
import type { AnimalReorgState } from '../types/ui'
import { FARM_COLS, FARM_ROWS, positionKey, getAllTilePositions } from '../../shared/game/farm'
import { getLooseStableKeys, getPastureCapacity } from '../../shared/actions/effects/animals'
import { getBuildRoomCost } from '../../shared/actions/effects/house'
import { stableWoodCost } from '../../shared/actions/effects/fencing'
import { computeScores } from '../../shared/logic/scoring'
import { applyIsDoableHooks } from '../../shared/actions/hooks'
import { majorImprovementIds } from '../../shared/game/major-improvements'
import { occupationIds } from '../../shared/game/occupations'
import { emptyResources, resourceKeyList } from '../../shared/logic/state'
import {
  baseActionOrder,
  createRoundOpenById,
} from '../../shared/logic/state'
import { useGameSync } from '../hooks/useGameSync'
import { HttpGameTransport, WsGameTransport, type GameTransport } from '../services/gameTransport'
import type { GameSyncPayload } from '../../shared/protocol/game'
import { rehydrateState } from '../../shared/game/serialization'
import { useFarmSelection } from '../hooks/useFarmSelection'
import { DevPanel } from '../components/dev/DevPanel'
import { ActionBoard } from '../components/board/ActionBoard'
import { FarmBoard } from '../components/board/FarmBoard'
import { LogPanel } from '../components/board/LogPanel'
import { MajorImprovements } from '../components/board/MajorImprovements'
import { ScoringPad } from '../components/board/ScoringPad'
import { GameControls } from '../components/controls/GameControls'
import { GameHeader } from '../components/header/GameHeader'
import { InteractionBar } from '../components/interaction/InteractionBar'
import { AnytimeBar } from '../components/interaction/AnytimeBar'
import { ResourceLine } from '../components/common/ResourceLine'
import {
  validateFence,
  validateRoom,
  validateStable,
  validatePlow,
  validateSow,
} from '../services/api'

type RoundSlot = { round: number; action?: ActionSpace }

const urlParams = new URLSearchParams(window.location.search)
const useWsMode = urlParams.get('transport') === 'ws'
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
  | { phase: 'waiting'; roomId: string }
  | { phase: 'ready'; roomId: string; playerIndex: number }
  | { phase: 'error'; message: string }

const useTransportSetup = (playerParam: string | null) => {
  const [wsStatus, setWsStatus] = useState<WsStatus>({ phase: 'idle' })
  const wsRef = useRef<WsGameTransport | null>(null)
  const [wsReady, setWsReady] = useState(false)

  const initRef = useRef(false)

  useEffect(() => {
    if (!useWsMode || initRef.current) return
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

      const roomParam = urlParams.get('room')
      const isCreator = !roomParam && (!playerParam || playerParam === 'p1')

      if (isCreator) {
        setWsStatus({ phase: 'creating' })
        const resp = await new Promise<{ roomId: string; playerIndex: number } | { error: string }>((resolve) => {
          const handler = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data as string)
              if (msg.type === 'roomCreated') {
                rawWs.removeEventListener('message', handler)
                resolve({ roomId: msg.roomId, playerIndex: msg.playerIndex })
              } else if (msg.type === 'error') {
                rawWs.removeEventListener('message', handler)
                resolve({ error: msg.error })
              }
            } catch { /* skip */ }
          }
          rawWs.addEventListener('message', handler)
          ws.sendRoomCommand('createRoom', { maxPlayers: 2, name: playerParam ?? 'Player 1' })
        })

        if ('error' in resp) {
          setWsStatus({ phase: 'error', message: resp.error })
          return
        }
        setRoomInUrl(resp.roomId)
        setWsStatus({ phase: 'waiting', roomId: resp.roomId })

        const handler = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string)
            if (msg.type === 'gameStarted') {
              rawWs.removeEventListener('message', handler)
              setWsReady(true)
              setWsStatus({ phase: 'ready', roomId: resp.roomId, playerIndex: resp.playerIndex })
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
            name: playerParam ?? 'Player 2',
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

  const transport: GameTransport = useWsMode && wsReady && wsRef.current ? wsRef.current : httpTransportSingleton
  const isReady = !useWsMode || wsReady
  return { transport, wsStatus, isWs: useWsMode, isReady }
}

export const GameContainerApi = () => {
  const lockedViewPlayerId = useMemo(() => {
    const raw = urlParams.get('player') ?? urlParams.get('playerId')
    if (!raw) return null
    if (/^p[1-4]$/.test(raw)) return raw
    const index = Number(raw)
    if (Number.isFinite(index) && index >= 1 && index <= 4) return `p${index}`
    return null
  }, [])
  const { transport, wsStatus, isWs, isReady } = useTransportSetup(lockedViewPlayerId)
  const { state, pending, historyLength, hasActionStartSnapshot, actionAvailability, applySnapshot } =
    useGameSync()
  const [locale, setLocale] = useState<Locale>('en')
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(lockedViewPlayerId)
  const [showScoringPad, setShowScoringPad] = useState(false)
  const [devMode, setDevMode] = useState(true)
  const [animalReorg, setAnimalReorg] = useState<AnimalReorgState | null>(null)
  const [bakeExchangeCounts, setBakeExchangeCounts] = useState<Record<string, number>>({})
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
  } = useFarmSelection()

  const handleSnapshot = useCallback((payload: GameSyncPayload) => {
    applySnapshot(payload)
    if (payload.pending.type === 'animalReorg') {
      const hydrated = rehydrateState(payload.state)
      const player = hydrated.players[payload.pending.playerIndex]
      if (player) {
        const stableKeys = getLooseStableKeys(player)
        setAnimalReorg({
          zones: [
            ...player.pastures.map((p) => ({
              id: p.id, zoneType: 'pasture' as const,
              animalType: p.animalType, animalCount: p.animalCount,
            })),
            { id: 'house', zoneType: 'house' as const, animalType: player.houseAnimalType ?? null, animalCount: player.houseAnimalCount ?? 0 },
            ...stableKeys.map((key) => ({
              id: `stable:${key}`, zoneType: 'stable' as const,
              animalType: player.stableAnimals?.[key] ?? null,
              animalCount: player.stableAnimals?.[key] ? 1 : 0,
            })),
          ],
          confirmDiscard: false,
        })
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
    }
  }, [applySnapshot, setPendingFenceEdges, setFenceError, setPendingRoomTiles, setRoomError, setPendingStableTiles, setStableError, setPendingPlowTile, setPlowError, setPendingSowSelections, setSowError])

  useEffect(() => {
    if (!isReady) return
    const unsub = transport.onSnapshot(handleSnapshot)
    transport.getState().catch((e) => { console.error("fetchState failed:", e) })
    return unsub
  }, [transport, handleSnapshot, isReady])

  const currentPlayer = state?.players[state.currentPlayerIndex] ?? null
  const viewedPlayer = state?.players.find((p) => p.id === viewPlayerId) ?? currentPlayer
  const displayPlayer = (viewPlayerId ? viewedPlayer : currentPlayer) ?? state?.players[0] ?? null
  const isInteractive = !!(currentPlayer && displayPlayer && currentPlayer.id === displayPlayer.id)

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

  const resolveChoice = useCallback((value: string) => {
    if (!isInteractive) return
    if (pending.type !== 'choice' || !currentPlayer) return
    const promptKey = pending.promptKey
    if (promptKey === 'ui.interactionFenceSelect') {
      if (value === 'cancel') {
        void transport.resolveChoice(pending.playerIndex, value).catch((e) => console.error(e))
        return
      }
      void validateFence(currentPlayer.id, pendingFenceEdges, 0).then((result) => {
        if (result.valid) {
          void transport.commitFarm(pending.playerIndex, 'fence', { edges: pendingFenceEdges, extraWood: 0 }).catch((e) => console.error(e))
        } else {
          setFenceError(result.error ?? { code: 'unknown', edges: [], newEdges: [] })
        }
      })
      return
    }
    if (promptKey === 'ui.interactionRoomSelect') {
      if (value === 'cancel') {
        void transport.resolveChoice(pending.playerIndex, value).catch((e) => console.error(e))
        return
      }
      const cost = getBuildRoomCost(currentPlayer.houseType)
      void validateRoom(currentPlayer.id, pendingRoomTiles, cost).then((result) => {
        if (result.valid) {
          void transport.commitFarm(pending.playerIndex, 'room', { rooms: pendingRoomTiles, costPerRoom: cost }).catch((e) => console.error(e))
        } else {
          setRoomError(result.error?.code ?? result.error ?? 'validation failed')
        }
      })
      return
    }
    if (promptKey === 'ui.interactionStableSelect') {
      if (value === 'cancel') {
        void transport.resolveChoice(pending.playerIndex, value).catch((e) => console.error(e))
        return
      }
      void validateStable(currentPlayer.id, pendingStableTiles).then((result) => {
        if (result.valid) {
          void transport.commitFarm(pending.playerIndex, 'stable', { stables: pendingStableTiles }).catch((e) => console.error(e))
        } else {
          setStableError(result.error?.code ?? result.error ?? 'validation failed')
        }
      })
      return
    }
    if (promptKey === 'ui.interactionPlowSelect' && pendingPlowTile) {
      if (value === 'cancel') {
        void transport.resolveChoice(pending.playerIndex, value).catch((e) => console.error(e))
        return
      }
      void validatePlow(currentPlayer.id, pendingPlowTile).then((result) => {
        if (result.valid) {
          void transport.commitFarm(pending.playerIndex, 'plow', { tile: pendingPlowTile }).catch((e) => console.error(e))
        } else {
          setPlowError(result.error?.code ?? result.error ?? 'validation failed')
        }
      })
      return
    }
    if (promptKey === 'ui.interactionSowSelect') {
      const crops = Object.entries(pendingSowSelections)
        .map(([key, crop]) => {
          const [rowText, colText] = key.split('-')
          const row = Number(rowText)
          const col = Number(colText)
          if (!Number.isFinite(row) || !Number.isFinite(col)) return null
          return { row, col, crop }
        })
        .filter((entry): entry is { row: number; col: number; crop: 'grain' | 'vegetable' } => !!entry)
      if (value === 'cancel') {
        void transport.resolveChoice(pending.playerIndex, value).catch((e) => console.error(e))
        return
      }
      if (crops.length === 0) {
        setSowError('NO_SELECTION')
        return
      }
      void validateSow(currentPlayer.id, crops).then((result) => {
        if (result.valid) {
          void transport.commitFarm(pending.playerIndex, 'sow', { crops }).catch((e) => console.error(e))
        } else {
          setSowError(result.error?.code ?? result.error ?? 'validation failed')
        }
      })
      return
    }
    void transport.resolveChoice(pending.playerIndex, value).catch((e) => console.error(e))
  }, [pending, currentPlayer, pendingFenceEdges, pendingRoomTiles, pendingStableTiles, pendingPlowTile, pendingSowSelections, transport, setFenceError, setRoomError, setStableError, setPlowError, setSowError, isInteractive])

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
    void transport.confirmPlayerSwitch().catch((e) => console.error(e))
  }, [transport])
  const confirmHarvestFeed = useCallback(() => {
    if (!isInteractive) return
    if (pending.type !== 'harvestFeed') return
    void transport.confirmFeed(pending.playerIndex, []).catch((e) => console.error(e))
  }, [pending, transport, isInteractive])
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

  const pendingChoice = pending.type === 'choice' ? {
    promptKey: pending.promptKey, options: pending.options,
    playerIndex: pending.playerIndex, spaceId: pending.spaceId,
  } : null
  const pendingNextPlayerIndex = pending.type === 'confirmNextPlayer' ? pending.nextPlayerIndex : null
  const pendingPlayerSwitch = pending.type === 'confirmPlayerSwitch' ? {
    fromPlayerIndex: pending.fromPlayerIndex,
    toPlayerIndex: pending.toPlayerIndex,
  } : null
  const pendingAnimalReorg = pending.type === 'animalReorg' ? { playerIndex: pending.playerIndex, spaceId: pending.spaceId } : null
  const harvestPending = pending.type === 'harvestFeed' && state ? {
    playerIndex: pending.playerIndex,
    playerName: state.players[pending.playerIndex]?.name ?? '',
    remaining: pending.remaining, foodUsed: 0,
  } : null
  const allWorkersUsed = state?.players.every((p) => p.workersAvailable <= 0) ?? false

  const roundOpenById = useMemo(() => state ? createRoundOpenById(state.roundActionOrder) : new Map<string, number>(), [state?.roundActionOrder])
  const canTakeActionForBoard = useCallback((space: ActionSpace, _player: PlayerState) => {
    if (!state || !currentPlayer || !isInteractive) return false
    if (space.takenBy) {
      // Allow card hooks to override the taken check (e.g., SheepRug)
      const canUseWhenTaken = applyIsDoableHooks(
        { state, player: currentPlayer, space, actionId: space.id },
        false, // Default: cannot use when taken
      )
      if (!canUseWhenTaken) return false
    }
    const openRound = roundOpenById.get(space.id) ?? space.roundAvailable
    if (state.round < openRound) return false
    if (currentPlayer.workersAvailable <= 0) return false
    if (state.gameOver) return false
    if (pendingChoice || pendingAnimalReorg || pendingNextPlayerIndex !== null || pendingPlayerSwitch || harvestPending) return false
    // Use backend-provided action availability
    if (actionAvailability[space.id] === false) return false
    return true
  }, [state, currentPlayer, roundOpenById, pendingChoice, pendingAnimalReorg, pendingNextPlayerIndex, pendingPlayerSwitch, harvestPending, isInteractive, actionAvailability])

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
  const baseActions = useMemo(() =>
    baseActionOrder.map((id) => actionMap.get(id)).filter((s): s is ActionSpace => !!s),
  [actionMap])

  const scoreSummaries = useMemo(() => state ? computeScores(state) : [], [state])

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

  const maxRoomSelections = useMemo(() => {
    if (!displayPlayer) return 0
    const cost = getBuildRoomCost(displayPlayer.houseType)
    const resourceMax = Object.entries(cost).reduce((max, [key, value]) => {
      if (typeof value !== 'number' || value <= 0) return max
      const available = displayPlayer.resources[key as keyof Resource] ?? 0
      return Math.min(max, Math.floor(available / value))
    }, Number.POSITIVE_INFINITY)
    const openTiles = FARM_ROWS * FARM_COLS - roomPositions.size - fieldPositions.size - stablePositions.size
    return Math.min(resourceMax, openTiles)
  }, [displayPlayer, roomPositions, fieldPositions, stablePositions])

  const resetBakeExchangeCounts = () => {
    const nextCounts: Record<string, number> = {}
    bakeExchangeOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setBakeExchangeCounts(nextCounts)
  }

  const maxStableSelections = useMemo(() => Math.max(0, Math.floor((displayPlayer?.resources.wood ?? 0) / stableWoodCost)), [displayPlayer?.resources.wood])
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
    ;(displayPlayer?.pastures ?? []).forEach((p) => { if (p.tiles.length > 0) map.set(positionKey(p.tiles[0]), getPastureCapacity(p)) })
    return map
  }, [displayPlayer?.pastures])
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
  const hasAnytimeReorg = (currentPlayer?.pastures.length ?? 0) > 0 || Object.keys(currentPlayer?.stableAnimals ?? {}).length > 0
  const openAnytimeReorg = () => {
    if (!currentPlayer) return
    const stKeys = getLooseStableKeys(currentPlayer)
    setAnimalReorg({ zones: [
      ...currentPlayer.pastures.map((p) => ({ id: p.id, zoneType: 'pasture' as const, animalType: p.animalType, animalCount: p.animalCount })),
      { id: 'house', zoneType: 'house' as const, animalType: currentPlayer.houseAnimalType ?? null, animalCount: currentPlayer.houseAnimalCount ?? 0 },
      ...stKeys.map((key) => ({ id: `stable:${key}`, zoneType: 'stable' as const, animalType: currentPlayer.stableAnimals?.[key] ?? null, animalCount: currentPlayer.stableAnimals?.[key] ? 1 : 0 })),
    ], confirmDiscard: false })
  }
  const wrappedToggleRoom = (tile: FarmTilePosition) =>
    toggleRoomTileInternal(tile, maxRoomSelections, positionKey)
  const wrappedToggleStable = (tile: FarmTilePosition) =>
    toggleStableTileInternal(tile, maxStableSelections, positionKey)
  const wrappedTogglePlow = (tile: FarmTilePosition) =>
    togglePlowTileInternal(tile, positionKey)
  const wrappedUpdateSow = (tile: FarmTilePosition, value: string) =>
    updateSowSelectionInternal(tile, value, positionKey)
  const setViewPlayerIdSafe = useCallback((value: string) => {
    if (lockedViewPlayerId) return
    setViewPlayerId(value)
  }, [lockedViewPlayerId])

  const adjustReorgAnimal = (zoneId: string, animalType: 'sheep' | 'boar' | 'cattle', delta: number) => {
    setAnimalReorg((prev) => {
      if (!prev || !pendingAnimalReorg || !state) return prev
      const player = state.players[pendingAnimalReorg.playerIndex]
      if (!player) return prev
      
      let capacity = 0
      if (zoneId === 'house') {
        capacity = 1
      } else if (zoneId.startsWith('stable:')) {
        capacity = 1
      } else {
        const pasture = player.pastures.find((p) => p.id === zoneId)
        if (pasture) capacity = getPastureCapacity(pasture)
      }

      const current = prev.zones.find((zone) => zone.id === zoneId)
      if (!current) return prev

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
  const plowSelectableSet = useMemo(() => {
    const occupied = new Set<string>()
    roomPositions.forEach((key) => occupied.add(key))
    fieldPositions.forEach((key) => occupied.add(key))
    stablePositions.forEach((key) => occupied.add(key))
    pastureTiles.forEach((_, key) => occupied.add(key))
    if (fieldPositions.size === 0) {
      const result = new Set<string>()
      getAllTilePositions().forEach((pos) => {
        const key = positionKey(pos)
        if (!occupied.has(key)) result.add(key)
      })
      return result
    }
    const deltas = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]
    const result = new Set<string>()
    getAllTilePositions().forEach((pos) => {
      const key = positionKey(pos)
      if (occupied.has(key)) return
      const adjacent = deltas.some((delta) =>
        fieldPositions.has(`${pos.row + delta.dr}-${pos.col + delta.dc}`),
      )
      if (adjacent) result.add(key)
    })
    return result
  }, [isSelectingPlow, roomPositions, fieldPositions, stablePositions, pastureTiles])
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
  const majorIdSet = useMemo(() => new Set(majorImprovementIds), [])
  const occupationIdSet = useMemo(() => new Set(occupationIds), [])

  const applyDevResource = useCallback(async () => {
    if (!devPlayerId || !state) return
    const clone = JSON.parse(JSON.stringify(state)) as import('../../shared/game/types').GameState
    const player = clone.players.find((p) => p.id === devPlayerId)
    if (!player) return
    const delta = Number(devAmount ?? 0)
    player.resources[devResource] = Math.max(0, (player.resources[devResource] ?? 0) + delta)
    
    await transport.loadGame(clone)
    
    if (devResource === 'sheep' || devResource === 'boar' || devResource === 'cattle') {
      const stKeys = getLooseStableKeys(player)
      setAnimalReorg({ 
        zones: [
          ...player.pastures.map((p) => ({ 
            id: p.id, 
            zoneType: 'pasture' as const, 
            animalType: p.animalType, 
            animalCount: p.animalCount 
          })),
          { 
            id: 'house', 
            zoneType: 'house' as const, 
            animalType: player.houseAnimalType ?? null, 
            animalCount: player.houseAnimalCount ?? 0 
          },
          ...stKeys.map((key) => ({ 
            id: `stable:${key}`, 
            zoneType: 'stable' as const, 
            animalType: player.stableAnimals?.[key] ?? null, 
            animalCount: player.stableAnimals?.[key] ? 1 : 0 
          })),
        ], 
        confirmDiscard: false 
      })
    }
  }, [devPlayerId, devResource, devAmount, state, transport])

  const applyDevRound = useCallback(() => {
    if (!state || !Number.isFinite(devRound)) return
    void transport.loadGame({ ...state, round: Math.max(1, Math.min(14, Math.floor(devRound))) }).catch((e) => console.error('applyDevRound error', e))
  }, [state, devRound, transport])

  const stripCardId = (id: string) => id.trim()
  const getCardType = useCallback((player: import('../../shared/game/types').PlayerState, cardId: string) => {
    if (majorIdSet.has(cardId)) return 'major'
    if (occupationIdSet.has(cardId)) return 'occupation'
    if (player.occupationHand.includes(cardId)) return 'occupation'
    if (player.minorHand.includes(cardId)) return 'minor'
    return 'minor'
  }, [majorIdSet, occupationIdSet])

  const playDevCard = useCallback(() => {
    if (!state || !devPlayerId) return
    const cardId = stripCardId(devCardId)
    if (!cardId) return
    const targetPlayer = state.players.find((p) => p.id === devPlayerId)
    if (!targetPlayer) return
    const cardType = getCardType(targetPlayer, cardId)
    const clone = JSON.parse(JSON.stringify(state)) as import('../../shared/game/types').GameState
    const cp = clone.players.find((p) => p.id === devPlayerId)!
    clone.players.forEach((p) => {
      p.minorHand = p.minorHand.filter((e) => e !== cardId)
      p.occupationHand = p.occupationHand.filter((e) => e !== cardId)
    })
    if (cardType === 'major') {
      clone.availableMajorImprovements = clone.availableMajorImprovements.filter((e) => e !== cardId)
      if (!cp.improvements.includes(cardId)) cp.improvements.push(cardId)
      cp.playedCards.push(`major:${cardId}`)
    } else if (cardType === 'occupation') {
      if (!cp.occupationPlayed.includes(cardId)) cp.occupationPlayed.push(cardId)
      cp.playedCards.push(`occupation:${cardId}`)
    } else {
      if (!cp.minorPlayed.includes(cardId)) cp.minorPlayed.push(cardId)
      cp.playedCards.push(`minor:${cardId}`)
    }
    void transport.loadGame(clone).catch((e) => console.error('playDevCard error', e))
  }, [state, devPlayerId, devCardId, getCardType, transport])

  const drawDevCard = useCallback(() => {
    if (!state || !devPlayerId) return
    const cardId = stripCardId(devCardId)
    if (!cardId) return
    const clone = JSON.parse(JSON.stringify(state)) as import('../../shared/game/types').GameState
    const cp = clone.players.find((p) => p.id === devPlayerId)!
    clone.players.forEach((p) => {
      p.minorHand = p.minorHand.filter((e) => e !== cardId)
      p.occupationHand = p.occupationHand.filter((e) => e !== cardId)
    })
    if (occupationIdSet.has(cardId)) {
      if (!cp.occupationHand.includes(cardId)) cp.occupationHand.push(cardId)
    } else {
      if (!cp.minorHand.includes(cardId)) cp.minorHand.push(cardId)
    }
    void transport.loadGame(clone).catch((e) => console.error('drawDevCard error', e))
  }, [state, devPlayerId, devCardId, occupationIdSet, transport])

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
    const statusText = wsStatus.phase === 'idle' ? 'Initializing...'
      : wsStatus.phase === 'connecting' ? 'Connecting to server...'
      : wsStatus.phase === 'creating' ? 'Creating room...'
      : wsStatus.phase === 'joining' ? `Joining room ${wsStatus.roomId}...`
      : wsStatus.phase === 'waiting' ? `Room ${wsStatus.roomId} — waiting for other player...`
      : wsStatus.phase === 'error' ? `Error: ${wsStatus.message}`
      : 'Loading...'

    return (
      <div className="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Open Agricola — WebSocket Mode</div>
        <div style={{ fontSize: '16px' }}>{statusText}</div>
        {wsStatus.phase === 'waiting' && (
          <div style={{ fontSize: '14px', color: '#666' }}>
            Other player: open <code>?player=p2&transport=ws</code>
          </div>
        )}
        {wsStatus.phase === 'error' && (
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Retry
          </button>
        )}
      </div>
    )
  }

  if (!state || !currentPlayer || !displayPlayer) {
    return <div className="app">Loading...</div>
  }

  return (
    <div className="app">
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
        fenceErrorText={fenceErrorText ?? ''} roomErrorText={roomErrorText ?? ''}
        stableErrorText={stableErrorText ?? ''} plowErrorText={plowErrorText ?? ''} sowErrorText={sowErrorText ?? ''}
        isSelectingFences={isSelectingFences} isSelectingRooms={isSelectingRooms}
        isSelectingStables={isSelectingStables} isSelectingPlow={isSelectingPlow} isSelectingSow={isSelectingSow}
        resolveChoice={resolveChoice} confirmNextPlayer={confirmNextPlayer}
        harvestFeedPlayerName={harvestPending?.playerName ?? null} confirmHarvestFeed={confirmHarvestFeed}
        isInteractive={isInteractive}
      />
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
      {showScoringPad ? <ScoringPad locale={locale} scores={scoreSummaries} onClose={() => setShowScoringPad(false)} /> : null}
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
        />
      ) : null}
      <AnytimeBar hasAnytimeReorg={hasAnytimeReorg} pendingChoice={pendingChoice} pendingNextPlayerIndex={pendingNextPlayerIndex} pendingAnimalReorg={pendingAnimalReorg} locale={locale} openAnytimeReorg={openAnytimeReorg} />
      <GameHeader locale={locale} setLocale={setLocale} state={state} currentPlayer={currentPlayer} allWorkersUsed={allWorkersUsed} devMode={devMode} setDevMode={setDevMode} isInteractive={isInteractive} myPlayerName={displayPlayer?.name ?? null} isMyTurn={isInteractive} />
      <GameControls
        locale={locale}
        onUndo={undoStep}
        onUndoAction={undoAction}
        onResetGame={resetGame}
        onShowScoring={() => setShowScoringPad(true)}
        historyLength={historyLength}
        hasActionStartSnapshot={hasActionStartSnapshot}
        isInteractive={isInteractive}
        devMode={devMode}
        seedValue={resetSeedInput}
        onSeedChange={setResetSeedInput}
      />
      <MajorImprovements locale={locale} availableMajorImprovements={state.availableMajorImprovements} currentPlayer={currentPlayer} isSelectingMajor={isSelectingImprovementAny} resolveChoice={resolveChoice} futureCardResources={futureCardResources} isInteractive={isInteractive} devMode={devMode} />
      <main className="board">
        <ActionBoard locale={locale} baseActions={baseActions} roundSlots={roundSlots} currentPlayer={currentPlayer} players={state.players} futureMeeples={state.futureMeeples} canTakeAction={canTakeActionForBoard} takeAction={takeAction} currentRound={state.round} devMode={devMode} />
        <FarmBoard locale={locale} players={state.players} currentPlayer={currentPlayer} displayPlayer={displayPlayer} devMode={devMode}
          currentStartPlayerId={state.players.find((p) => p.startPlayer)?.id ?? ''}
          nextStartPlayerId={state.players.find((p) => p.startPlayer)?.id ?? ''}
          playedCards={playedCards} farmCells={farmCells} roomPositions={roomPositions} fieldPositions={fieldPositions}
          fieldMap={fieldMap} stablePositions={stablePositions}
          pendingRoomSet={new Set(pendingRoomTiles.map((tp) => positionKey(tp)))}
          pendingStableSet={new Set(pendingStableTiles.map((tp) => positionKey(tp)))}
          canSelectRooms={isSelectingRooms} canSelectStables={isSelectingStables} canSelectPlow={isSelectingPlow} canSelectSow={isSelectingSow}
          maxStableSelections={maxStableSelections} plowSelectableSet={plowSelectableSet} pendingPlowTile={pendingPlowTile}
          pendingSowSelections={pendingSowSelections} sowRemaining={sowRemaining} pastureTiles={pastureTiles}
          pastureDisplayMap={pastureDisplayMap} pastureCapacityMap={pastureCapacityMap} houseDisplay={houseDisplay}
          stableDisplayMap={stableDisplayMap} isReorgActive={isReorgActive} reorgRemaining={reorgRemaining}
          hasReorgOverflow={hasReorgOverflow} animalReorg={animalReorg} pendingFenceSet={pendingFenceSet}
          existingFenceSet={existingFenceSet} canSelectFences={isSelectingFences}
          toggleRoomTile={wrappedToggleRoom} toggleStableTile={wrappedToggleStable}
          togglePlowTile={wrappedTogglePlow} updateSowSelection={wrappedUpdateSow}
          toggleFenceEdge={toggleFenceEdge} adjustReorgAnimal={adjustReorgAnimal}
          confirmAnimalReorg={confirmAnimalReorg} cancelAnimalDiscardPrompt={cancelAnimalDiscardPrompt}
          setViewPlayerId={setViewPlayerIdSafe} isSelectingMinor={isSelectingMinor} isSelectingOccupation={isSelectingOccupation}
          isSelectingImprovementAny={isSelectingImprovementAny} futureCardResources={futureCardResources} resolveChoice={resolveChoice}
          isInteractive={isInteractive}
        />
      </main>
      <LogPanel locale={locale} log={state.log} />
    </div>
  )
}
