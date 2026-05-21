import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import type { ActionSpace, CropStack, FarmTilePosition, PlayerState, Resource } from '../../shared/contract/types'
import { getPlayedCardKeys } from '../../shared/domain/player'
import { t } from '../../shared/i18n'
import type { AnimalReorgState, ExtraSowTarget, PendingSowCrop } from '../types/ui'
import { parsePositionKey, positionKey } from '../../shared/domain/farm'
import { emptyResources, resourceKeyList } from '../../shared/contract/state-constants'
import { useGameSync } from '../hooks/useGameSync'
import { HttpGameTransport, WsGameTransport, parseDraftParamsFromQuery, type GameTransport } from '../services/gameTransport'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import { playerCanBuildPalisades } from '../../shared/cards/helpers/card-type'
import { useFarmSelection } from '../hooks/useFarmSelection'
import { buildHarvestFeedOptions } from './hooks/use-harvest-flow'
import { computeHarvestFeedCounterMax } from './hooks/use-harvest-feed-counter'
import { DevPanel } from '../components/dev/DevPanel'
import { ActionBoard } from '../components/board/ActionBoard'
import { PlayerFarmPanel } from '../components/board/PlayerFarmPanel'
import { MajorImprovements } from '../components/board/MajorImprovements'
import { ScoringPad } from '../components/board/ScoringPad'
import { StageBar } from '../components/board/StageBar'
import { PlayerTabs } from '../components/board/PlayerTabs'
import { ScorePanel, type PlayerScoreRow } from '../components/board/ScorePanel'
import { ActionLog } from '../components/board/ActionLog'
import { GameHeader } from '../components/header/GameHeader'
import { InteractionBar } from '../components/interaction/InteractionBar'
import { BrandMark } from '../components/common/BrandMark'
import { ResourceLine } from '../components/common/ResourceLine'
import { Section } from '../components/common/Section'
import { PublicEventResourceAnimations } from '../components/effects/PublicEventResourceAnimations'
import { DraftOverlay } from './draft/DraftOverlay'
import {
  buildBakeExchangeInfo,
  buildBakeBulkChoice,
  hasSelectedBakeGrain,
} from './bake-exchange-ui'
import { getCardMeta } from '../services/card-meta'
import {
  applyPublicEventCancellationSnapshot,
  buildReplayFeedback,
  farmCommitErrorMessageKey,
  filterPublicFarmHighlightsForPlayer,
  filterPublicFenceHighlightsForPlayer,
  getCurrentlySelectableRoomKeys,
  hasPublicEventHighlights,
  isDevModeAllowedFromQuery,
  mergePublicEventHighlights,
  mergePublicEventResourceAnimations,
  playerIdFromWsStatus,
  removePublicEventHighlights,
  removePublicEventResourceAnimations,
  type FarmCommitType,
  type WsStatus,
} from './game-container-helpers'
import { buildActionLogTimelineRows } from './action-log-timeline'
import {
  buildPastureDisplayMap,
  buildStableDisplayMap,
  shouldShowAnimalDiscardPrompt,
} from './hooks/use-animal-reorg-flow'
import {
  collectPrivateEventNotifications,
  type PrivateEventNotification,
} from './private-event-notifications'
import {
  buildEventNotificationStackItems,
  collectNewPublicEventFeedback,
  emptyPublicEventHighlightTargets,
  type PublicEventHighlightTargets,
  type PublicEventNotification,
  type PublicEventResourceAnimation,
} from './public-event-notifications'
import {
  buildReplayTimeline,
  filterReplayTimeline,
  summarizeReplayTimeline,
  type ReplayTimelineEntry,
  type ReplayTimelineFilter,
} from './replay-timeline'

type RoundSlot = { round: number; action?: ActionSpace }

const httpTransportSingleton = new HttpGameTransport()

/** Update browser URL to include room= so the link can be shared; same room id = same game. */
const setRoomInUrl = (roomId: string) => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.delete('card')
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

const isOffBoardSowTile = (tile: FarmTilePosition) =>
  tile.row < 0 || tile.row > 2 || tile.col < 0 || tile.col > 4

const useTransportSetup = (playerParam: string | null, displayName?: string, isWsMode = false) => {
  const [wsStatus, setWsStatus] = useState<WsStatus>({ phase: 'idle' })
  const [wsTransport, setWsTransport] = useState<WsGameTransport | null>(null)
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

      const rawWs = (ws as unknown as { ws: WebSocket }).ws
      if (!rawWs) {
        setWsStatus({ phase: 'error', message: 'no WebSocket instance' })
        return
      }
      setWsTransport(ws)

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
          const searchParams = new URLSearchParams(window.location.search)
          const customCardsParam = searchParams.get('customCards')
          const customCardIds = customCardsParam ? customCardsParam.split(',').filter(Boolean) : undefined
          const maxPlayersParam = searchParams.get('maxPlayers')
          const maxPlayers = maxPlayersParam ? Math.min(Math.max(2, Number(maxPlayersParam)), 4) : 2
          const draftParams = parseDraftParamsFromQuery(window.location.search)
          const enableCommunityDeck = searchParams.get('enableCommunityDeck') === 'true' || undefined
          ws.sendRoomCommand('createRoom', {
            maxPlayers,
            name: displayName ?? playerParam ?? 'Player 1',
            customCardIds,
            enableCommunityDeck,
            ...(draftParams ?? {}),
          })
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
        const roomId = roomParam
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
  }, [displayName, isWsMode, playerParam])

  const transport: GameTransport = isWsMode && wsReady && wsTransport ? wsTransport : httpTransportSingleton
  const isReady = !isWsMode || wsReady
  return { transport, wsStatus, isWs: isWsMode, isReady, wsTransport }
}

const getIsMobileViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 900px)').matches

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
  const { state, interaction, scores, pastureCapacities, historyLength, hasActionStartSnapshot, actionAvailability, cardAvailability, privateEvents, applySnapshot } =
    useGameSync()
  const privateEventNotificationBatchSeqRef = useRef(0)
  const privateEventNotificationTimersRef = useRef<number[]>([])
  const publicEventNotificationBatchSeqRef = useRef(0)
  const publicEventNotificationTimersRef = useRef<number[]>([])
  const publicEventHighlightTimersRef = useRef<number[]>([])
  const publicEventResourceAnimationTimersRef = useRef<number[]>([])
  const lastSeenPublicEventSeqRef = useRef<number | null>(null)
  const { locale } = useLocale()
  const [privateEventNotifications, setPrivateEventNotifications] = useState<PrivateEventNotification[]>([])
  const [publicEventNotifications, setPublicEventNotifications] = useState<PublicEventNotification[]>([])
  const [publicEventHighlights, setPublicEventHighlights] = useState<PublicEventHighlightTargets>(() => emptyPublicEventHighlightTargets())
  const [publicEventResourceAnimations, setPublicEventResourceAnimations] = useState<PublicEventResourceAnimation[]>([])
  const [replayFilter, setReplayFilter] = useState<ReplayTimelineFilter>('all')
  const [selectedReplayKey, setSelectedReplayKey] = useState<string | null>(null)
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(lockedViewPlayerId)
  const [showScoringPad, setShowScoringPad] = useState(false)
  const [devMode, setDevMode] = useState(() => isDevModeAllowedFromQuery(window.location.search))
  const [animalReorg, setAnimalReorg] = useState<AnimalReorgState | null>(null)
  const [bakeExchangeCounts, setBakeExchangeCounts] = useState<Record<string, number>>({})
  const [harvestFeedCounts, setHarvestFeedCounts] = useState<Record<string, number>>({})
  const [devPlayerIdOverride, setDevPlayerIdOverride] = useState<string | null>(null)
  const [devResource, setDevResource] = useState<keyof Resource>('wood')
  const [devAmount, setDevAmount] = useState(1)
  const [devRound, setDevRound] = useState(1)
  const [isMobile, setIsMobile] = useState(getIsMobileViewport)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 900px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])
  const [devCardId, setDevCardId] = useState('')
  const [resetSeedInput, setResetSeedInput] = useState('')
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  const clearPublicEventFeedbackTimers = useCallback(() => {
    publicEventNotificationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventNotificationTimersRef.current = []
    publicEventHighlightTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventHighlightTimersRef.current = []
    publicEventResourceAnimationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventResourceAnimationTimersRef.current = []
  }, [])

  const clearPublicEventFeedback = useCallback(() => {
    clearPublicEventFeedbackTimers()
    setPublicEventNotifications([])
    setPublicEventHighlights(emptyPublicEventHighlightTargets())
    setPublicEventResourceAnimations([])
  }, [clearPublicEventFeedbackTimers])

  const clearReplayCue = useCallback(() => {
    setSelectedReplayKey(null)
  }, [])

  useEffect(() => () => {
    privateEventNotificationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    privateEventNotificationTimersRef.current = []
    clearPublicEventFeedbackTimers()
  }, [clearPublicEventFeedbackTimers])

  useEffect(() => {
    if (privateEvents.length === 0) return
    privateEventNotificationBatchSeqRef.current += 1
    const notifications = collectPrivateEventNotifications(
      privateEvents,
      locale,
      `batch-${privateEventNotificationBatchSeqRef.current}`,
    )
    if (notifications.length === 0) return
    setPrivateEventNotifications((current) => [...notifications, ...current].slice(0, 4))
    notifications.forEach((notification) => {
      const timer = window.setTimeout(() => {
        setPrivateEventNotifications((current) =>
          current.filter((entry) => entry.id !== notification.id),
        )
        privateEventNotificationTimersRef.current = privateEventNotificationTimersRef.current.filter((entry) => entry !== timer)
      }, 4500)
      privateEventNotificationTimersRef.current.push(timer)
    })
  }, [privateEvents, locale])

  useEffect(() => {
    if (!state) return
    const events = state.events ?? []
    publicEventNotificationBatchSeqRef.current += 1
    const batch = collectNewPublicEventFeedback(
      events,
      lastSeenPublicEventSeqRef.current,
      locale,
      `public-batch-${publicEventNotificationBatchSeqRef.current}`,
    )
    lastSeenPublicEventSeqRef.current = batch.nextCursor
    if (hasPublicEventHighlights(batch.highlights)) {
      setPublicEventHighlights((current) => mergePublicEventHighlights(current, batch.highlights))
      const timer = window.setTimeout(() => {
        setPublicEventHighlights((current) => removePublicEventHighlights(current, batch.highlights))
        publicEventHighlightTimersRef.current = publicEventHighlightTimersRef.current.filter((entry) => entry !== timer)
      }, 3200)
      publicEventHighlightTimersRef.current.push(timer)
    }
    if (batch.resourceAnimations.length > 0) {
      setPublicEventResourceAnimations((current) =>
        mergePublicEventResourceAnimations(current, batch.resourceAnimations).slice(0, 12),
      )
      const timer = window.setTimeout(() => {
        setPublicEventResourceAnimations((current) =>
          removePublicEventResourceAnimations(current, batch.resourceAnimations),
        )
        publicEventResourceAnimationTimersRef.current =
          publicEventResourceAnimationTimersRef.current.filter((entry) => entry !== timer)
      }, 1400)
      publicEventResourceAnimationTimersRef.current.push(timer)
    }
    if (batch.notifications.length > 0) {
      setPublicEventNotifications((current) => [...batch.notifications, ...current].slice(0, 4))
      batch.notifications.forEach((notification) => {
        const timer = window.setTimeout(() => {
          setPublicEventNotifications((current) =>
            current.filter((entry) => entry.id !== notification.id),
          )
          publicEventNotificationTimersRef.current = publicEventNotificationTimersRef.current.filter((entry) => entry !== timer)
        }, 4500)
        publicEventNotificationTimersRef.current.push(timer)
      })
    }
  }, [state, locale])

  const {
    pendingFenceEdges, setPendingFenceEdges, pendingPalisadeEdges,
    fencePlacementMode, setFencePlacementMode, fenceError, setFenceError,
    pendingRoomTiles, setPendingRoomTiles, roomError, setRoomError,
    pendingStableTiles, setPendingStableTiles, stableError, setStableError,
    pendingPlowTile, setPendingPlowTile, plowError, setPlowError,
    pendingSowSelections, setPendingSowSelections, sowError, setSowError,
    toggleFenceEdge,
    toggleRoomTile: toggleRoomTileInternal,
    toggleStableTile: toggleStableTileInternal,
    togglePlowTile: togglePlowTileInternal,
    updateSowSelection: updateSowSelectionInternal,
    pendingPositionSelections, setPendingPositionSelections,
    togglePositionSelection: togglePositionSelectionInternal,
  } = useFarmSelection()

  const handleSnapshot = useCallback((payload: GameSyncPayload) => {
    applySnapshot(payload)
    applyPublicEventCancellationSnapshot(payload, {
      clearPublicEventFeedback,
      setLastSeenPublicEventSeq: (seq) => {
        lastSeenPublicEventSeqRef.current = seq
      },
    })
    if (
      payload.interaction.stateId === 'wait' &&
      payload.interaction.request.kind === 'animal-reorg'
    ) {
      setAnimalReorg({
        zones: payload.interaction.zones ?? [],
        confirmDiscard: false,
      })
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
      setPendingPositionSelections(new Set())
    }
  }, [applySnapshot, clearPublicEventFeedback, setPendingFenceEdges, setFenceError, setPendingRoomTiles, setRoomError, setPendingStableTiles, setStableError, setPendingPlowTile, setPlowError, setPendingSowSelections, setSowError, setPendingPositionSelections])

  useEffect(() => {
    if (!isReady) return
    const unsub = transport.onSnapshot(handleSnapshot)
    transport.getState().catch((e) => { console.error("fetchState failed:", e) })
    return unsub
  }, [transport, handleSnapshot, isReady])

  const currentPlayer = state?.players[state.currentPlayerIndex] ?? null
  const fallbackDevPlayerId = viewPlayerId ?? currentPlayer?.id ?? ''
  const devPlayerId = devPlayerIdOverride ?? fallbackDevPlayerId
  const setDevPlayerId = useCallback((value: string) => {
    setDevPlayerIdOverride(value)
  }, [])
  const wsAssignedPlayerId = isWs ? playerIdFromWsStatus(wsStatus) : null
  const localPlayerId = lockedViewPlayerId ?? wsAssignedPlayerId
  // In WS mode, selfPlayer is locked to the URL ?player= param.
  // If the URL omits ?player=, use the seat assigned by the join/create handshake.
  // In HTTP mode (sandbox/single-player), selfPlayer follows the current player.
  const selfPlayer = isWs && localPlayerId
    ? state?.players.find((p) => p.id === localPlayerId) ?? currentPlayer
    : currentPlayer
  const viewedPlayer = state?.players.find((p) => p.id === viewPlayerId) ?? selfPlayer ?? currentPlayer
  // In WS mode, viewPlayerId lets you peek at another player's board.
  // In HTTP (sandbox) mode, display follows the current player so the panel switches on turn change.
  const displayPlayer = isWs
    ? ((viewPlayerId ? viewedPlayer : selfPlayer ?? currentPlayer) ?? state?.players[0] ?? null)
    : (selfPlayer ?? currentPlayer ?? state?.players[0] ?? null)
  const activePlayer =
    interaction.stateId === 'wait' && interaction.request.kind === 'confirm-player-switch'
      ? state?.players[interaction.fromPlayerIndex ?? 0] ?? currentPlayer
      : interaction.stateId === 'wait' && typeof interaction.playerIndex === 'number'
        ? state?.players[interaction.playerIndex] ?? currentPlayer
        : currentPlayer
  const isMyTurn = !!(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)
  // In HTTP (non-WS) mode, one human controls all players — always interactive
  const isInteractive = isWs
    ? !!(activePlayer && selfPlayer && displayPlayer &&
         activePlayer.id === selfPlayer.id && displayPlayer.id === selfPlayer.id)
    : !!(activePlayer && displayPlayer)
  const hasGameView = !!(state && currentPlayer && displayPlayer)

  useLayoutEffect(() => {
    if (!hasGameView) return
    const node = headerRef.current
    if (!node) return

    const updateHeaderHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height)
      setHeaderHeight((current) => (current === nextHeight ? current : nextHeight))
    }

    updateHeaderHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeaderHeight)
      return () => window.removeEventListener('resize', updateHeaderHeight)
    }

    const observer = new ResizeObserver(() => {
      updateHeaderHeight()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasGameView])

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
    const targetIdx =
      interaction.stateId === 'wait'
        ? interaction.playerIndex
        : state.currentPlayerIndex
    void transport.takeAnytimeAction(targetIdx, actionId).catch((e) => {
      console.error('takeAnytimeAction error', e)
    })
  }, [state, transport, isInteractive, interaction])

  const setFarmCommitError = useCallback((farmType: FarmCommitType, error?: string) => {
    if (farmType === 'fence') {
      setFenceError({ code: error ?? 'UNKNOWN', edges: [], newEdges: [] })
      return
    }
    if (farmType === 'room') {
      setRoomError(error ?? 'UNKNOWN')
      return
    }
    if (farmType === 'stable') {
      setStableError(error ?? 'UNKNOWN')
      return
    }
    if (farmType === 'plow') {
      setPlowError(error ?? 'UNKNOWN')
      return
    }
    setSowError(error ?? 'UNKNOWN')
  }, [setFenceError, setPlowError, setRoomError, setSowError, setStableError])

  const resolveChoice = useCallback((value: string) => {
    if (!isInteractive) return
    if (!currentPlayer) return
    if (interaction.stateId === 'wait' && interaction.selection) {
      const pendingPlayerIndex = interaction.playerIndex
      if (value === 'cancel') {
        void transport.resolveChoice(pendingPlayerIndex, value).catch((e) => console.error(e))
        return
      }
      const positions = [...pendingPositionSelections]
        .map((key) => parsePositionKey(key))
        .filter((tile): tile is FarmTilePosition => !!tile)
      void transport.commitSelection(pendingPlayerIndex, { positions }).catch((e) => console.error(e))
      return
    }
    if (interaction.stateId === 'wait' && interaction.farm) {
      const pendingPlayerIndex = interaction.playerIndex
      const farm = interaction.farm
      if (value === 'cancel') {
        void transport.resolveChoice(pendingPlayerIndex, value).catch((e) => console.error(e))
        return
      }
      if (farm.farmType === 'fence') {
        void transport.resolveChoice(pendingPlayerIndex, 'confirm', {
          edges: pendingFenceEdges,
          palisadeEdges: pendingPalisadeEdges,
          extraWood: farm.extraWood ?? 0,
        })
          .then((resp) => {
            if (!resp.ok) setFarmCommitError('fence', resp.error)
          })
          .catch((e) => {
            console.error(e)
            setFarmCommitError('fence')
          })
        return
      }
      if (farm.farmType === 'room') {
        void transport.resolveChoice(pendingPlayerIndex, 'confirm', { rooms: pendingRoomTiles })
          .then((resp) => {
            if (!resp.ok) setFarmCommitError('room', resp.error)
          })
          .catch((e) => {
            console.error(e)
            setFarmCommitError('room')
          })
        return
      }
      if (farm.farmType === 'stable') {
        if (pendingStableTiles.length === 0) {
          setStableError('NO_SELECTION')
          return
        }
        void transport.resolveChoice(pendingPlayerIndex, 'confirm', { stables: pendingStableTiles })
          .then((resp) => {
            if (!resp.ok) setFarmCommitError('stable', resp.error)
          })
          .catch((e) => {
            console.error(e)
            setFarmCommitError('stable')
          })
        return
      }
      if (farm.farmType === 'plow') {
        if (!pendingPlowTile) {
          setPlowError('NO_SELECTION')
          return
        }
        void transport.resolveChoice(pendingPlayerIndex, 'confirm', { tile: pendingPlowTile })
          .then((resp) => {
            if (!resp.ok) setFarmCommitError('plow', resp.error)
          })
          .catch((e) => {
            console.error(e)
            setFarmCommitError('plow')
          })
        return
      }
      if (farm.farmType === 'sow') {
        const crops = Object.entries(pendingSowSelections)
          .map(([key, crop]) => {
            const tile = parsePositionKey(key)
            if (!tile) return null
            return { row: tile.row, col: tile.col, crop }
          })
          .filter(
            (entry): entry is { row: number; col: number; crop: PendingSowCrop } =>
              !!entry &&
              (entry.crop === 'grain' ||
                entry.crop === 'vegetable' ||
                entry.crop === 'wood' ||
                entry.crop === 'stone'),
          )
        if (crops.length === 0) {
          setSowError('NO_SELECTION')
          return
        }
        void transport.resolveChoice(pendingPlayerIndex, 'confirm', { crops })
          .then((resp) => {
            if (!resp.ok) setFarmCommitError('sow', resp.error)
          })
          .catch((e) => {
            console.error(e)
            setFarmCommitError('sow')
          })
        return
      }
      return
    }
    if (interaction.stateId === 'wait' && interaction.request.kind === 'animal-reorg') {
      if (value === 'confirm' && animalReorg) {
        void transport.resolveChoice(interaction.playerIndex, 'confirm', { zones: animalReorg.zones }).catch((e) => console.error(e))
      } else {
        void transport.resolveChoice(interaction.playerIndex, value).catch((e) => console.error(e))
      }
      return
    }
    if (interaction.stateId !== 'wait') return
    if (interaction.request.kind !== 'choice' && interaction.request.kind !== 'select-trigger') return
    void transport.resolveChoice(interaction.playerIndex, value).catch((e) => console.error(e))
  }, [interaction, currentPlayer, animalReorg, pendingFenceEdges, pendingPalisadeEdges, pendingRoomTiles, pendingStableTiles, pendingPlowTile, pendingPositionSelections, pendingSowSelections, transport, setPlowError, setSowError, setStableError, isInteractive, setFarmCommitError])

  const updateBakeExchangeCount = (id: string, delta: number) => {
    if (!bakeExchangePlayer) return
    setBakeExchangeCounts((prev) => {
      const current = prev[id] ?? 0
      const maxUse = bakeExchangeInfo[id]?.max ?? 0
      const totalSelected = bakeExchangeOptionIds.reduce(
        (sum, optionId) => sum + (prev[optionId] ?? 0),
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
    const choice = buildBakeBulkChoice(activeBakeExchangeCounts)
    if (!choice) return
    resolveChoice(choice)
  }

  const confirmNextPlayer = useCallback(() => {
    if (!isInteractive) return
    void transport.confirmNextPlayer().catch((e) => console.error(e))
  }, [transport, isInteractive])
  const confirmPlayerSwitch = useCallback(() => {
    if (!isInteractive) return
    void transport.confirmPlayerSwitch().catch((e) => console.error(e))
  }, [transport, isInteractive])
  const resetGame = useCallback(() => {
    if (!isInteractive) return
    const seed = resetSeedInput ? Number(resetSeedInput) : undefined
    void transport.newGame(Number.isFinite(seed) ? seed : undefined).catch((e) => console.error(e))
  }, [transport, isInteractive, resetSeedInput])

  const interactionRequestKind =
    interaction.stateId === 'wait'
      ? (interaction.request as { kind?: string }).kind
      : null
  const pendingEngineBlocked =
    interaction.stateId === 'wait' && interactionRequestKind === 'engine-blocked'
      ? {
          promptKey: interaction.promptKey,
          promptParams: interaction.promptParams,
        }
      : null
  const pendingChoice =
    interaction.stateId === 'wait' &&
    (interactionRequestKind === 'choice' ||
      interactionRequestKind === 'select-trigger' ||
      interactionRequestKind === 'farm-select' ||
      interactionRequestKind === 'selection' ||
      interaction.farm !== undefined ||
      interaction.selection !== undefined)
      ? {
          promptKey: interaction.promptKey,
          promptParams: interaction.promptParams,
          options: interaction.options ?? [],
          playerIndex: interaction.playerIndex,
          spaceId: interaction.spaceId ?? '',
          sourceCard: interaction.sourceCard,
          fenceExtraWood:
            interaction.farm?.farmType === 'fence'
              ? interaction.farm.extraWood ?? 0
              : undefined,
        }
      : null
  const pendingNextPlayerIndex =
    interaction.stateId === 'wait' && interaction.request.kind === 'confirm-next-player'
      ? interaction.nextPlayerIndex ?? null
      : null
  const pendingPlayerSwitch =
    interaction.stateId === 'wait' && interaction.request.kind === 'confirm-player-switch'
      ? {
          fromPlayerIndex: interaction.fromPlayerIndex ?? 0,
          toPlayerIndex: interaction.toPlayerIndex ?? 0,
        }
      : null
  const pendingAnimalReorg = useMemo(
    () =>
      interaction.stateId === 'wait' && interaction.request.kind === 'animal-reorg'
        ? { playerIndex: interaction.playerIndex, spaceId: interaction.spaceId ?? '' }
        : null,
    [interaction],
  )
  const harvestPending = useMemo(
    () =>
      interaction.stateId === 'wait' && interaction.request.kind === 'feed' && state
        ? {
            playerIndex: interaction.playerIndex,
            playerName: state.players[interaction.playerIndex]?.name ?? '',
            remaining: interaction.remaining ?? 0,
            foodUsed: interaction.foodUsed ?? 0,
          }
        : null,
    [interaction, state],
  )
  const canTakeActionForBoard = useCallback((space: ActionSpace, _player: PlayerState) => {
    if (!state || !currentPlayer || !isInteractive) return false
    if (interaction.stateId !== 'idle') return false
    return actionAvailability[space.id] === true
  }, [state, currentPlayer, interaction.stateId, isInteractive, actionAvailability])

  const actionSpaces = state?.actionSpaces
  const roundActionOrder = state?.roundActionOrder
  const availableMajorImprovements = state?.availableMajorImprovements
  const actionMap = useMemo(() => {
    if (!actionSpaces) return new Map<string, ActionSpace>()
    return new Map(actionSpaces.map((s) => [s.id, s]))
  }, [actionSpaces])
  const actionNames = useMemo(() => {
    if (!actionSpaces) return {}
    return Object.fromEntries(actionSpaces.map((space) => [space.id, space.nameKey]))
  }, [actionSpaces])
  const playerNames = useMemo(() => {
    if (!state) return {}
    return Object.fromEntries(state.players.map((player) => [player.id, player.name ?? player.id]))
  }, [state])
  const replayTimeline = useMemo(
    () => buildReplayTimeline({
      events: state?.events ?? [],
      publicEventArchive: state?.publicEventArchive ?? [],
    }),
    [state?.events, state?.publicEventArchive],
  )
  const replaySummary = useMemo(() => summarizeReplayTimeline(replayTimeline), [replayTimeline])
  const replayStepEntries = useMemo(
    () => filterReplayTimeline(replayTimeline, replayFilter).filter((entry) => entry.replayable),
    [replayFilter, replayTimeline],
  )
  const actionLogTimelineBuckets = useMemo(
    () => buildActionLogTimelineRows({
      entries: replayTimeline,
      legacyLog: state?.log ?? [],
      currentRound: state?.round ?? 1,
      locale,
      playerNames,
      actionNames,
    }),
    [actionNames, locale, playerNames, replayTimeline, state?.log, state?.round],
  )
  const selectedReplayEntry = useMemo(
    () => selectedReplayKey
      ? replayTimeline.find((entry) => entry.key === selectedReplayKey) ?? null
      : null,
    [replayTimeline, selectedReplayKey],
  )
  const replayFeedback = useMemo(
    () => buildReplayFeedback(selectedReplayEntry, locale),
    [locale, selectedReplayEntry],
  )
  const handleSelectReplayEntry = useCallback((entry: ReplayTimelineEntry) => {
    setSelectedReplayKey(entry.key)
  }, [])
  const handleReplayLatest = useCallback(() => {
    setIsReplayPlaying(false)
    clearReplayCue()
  }, [clearReplayCue])
  const handleReplayStep = useCallback((direction: 'prev' | 'next') => {
    if (replayStepEntries.length === 0) return
    const currentIndex = replayStepEntries.findIndex((entry) => entry.key === selectedReplayKey)
    const nextIndex = direction === 'next'
      ? (currentIndex < 0 ? 0 : Math.min(currentIndex + 1, replayStepEntries.length - 1))
      : (currentIndex < 0 ? replayStepEntries.length - 1 : Math.max(currentIndex - 1, 0))
    const nextEntry = replayStepEntries[nextIndex]
    if (nextEntry) handleSelectReplayEntry(nextEntry)
  }, [handleSelectReplayEntry, replayStepEntries, selectedReplayKey])
  const handleReplayPlayPause = useCallback(() => {
    setIsReplayPlaying((current) => !current)
  }, [])

  useEffect(() => {
    if (!isReplayPlaying) return
    const timer = window.setTimeout(() => {
      if (replayStepEntries.length === 0) {
        setIsReplayPlaying(false)
        return
      }
      const currentIndex = replayStepEntries.findIndex((entry) => entry.key === selectedReplayKey)
      const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1
      if (nextIndex >= replayStepEntries.length) {
        setIsReplayPlaying(false)
        return
      }
      const nextEntry = replayStepEntries[nextIndex]
      if (nextEntry) handleSelectReplayEntry(nextEntry)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [handleSelectReplayEntry, isReplayPlaying, replayStepEntries, selectedReplayKey])
  const roundSlots: RoundSlot[] = useMemo(() => {
    if (!roundActionOrder) return []
    return roundActionOrder.map((id, index) => {
      const action = id ? actionMap.get(id) : undefined
      return {
        round: index + 1,
        action: action ?? undefined,
      }
    })
  }, [roundActionOrder, actionMap])
  const baseActions = useMemo(() => {
    if (!actionSpaces || !roundActionOrder) return []
    const roundIds = new Set(roundActionOrder.filter(Boolean))
    return actionSpaces.filter((space) => !roundIds.has(space.id))
  }, [actionSpaces, roundActionOrder])

  const playedCards = displayPlayer ? getPlayedCardKeys(displayPlayer) : []

  const isSelectingFences = pendingChoice?.promptKey === 'ui.interactionFenceSelect'
  const isSelectingStables = pendingChoice?.promptKey === 'ui.interactionStableSelect'
  const isSelectingRooms = pendingChoice?.promptKey === 'ui.interactionRoomSelect'
  const isSelectingPlow = pendingChoice?.promptKey === 'ui.interactionPlowSelect'
  const isSelectingSow = pendingChoice?.promptKey === 'ui.interactionSowSelect'
  const isSelectingMinor = pendingChoice?.promptKey === 'ui.interactionChooseMinorImprovement' || pendingChoice?.promptKey === 'ui.interactionChooseImprovement'
  const isSelectingOccupation = pendingChoice?.promptKey === 'ui.interactionChooseOccupation'
  const isSelectingImprovementAny = pendingChoice?.promptKey === 'ui.interactionChooseImprovement'
  const pendingChoiceOptions = pendingChoice?.options
  const selectableMinorIds =
    pendingChoiceOptions && isSelectingMinor
      ? new Set(
          pendingChoiceOptions
            .map((option) =>
              option.value.startsWith('minor:') ? option.value.slice('minor:'.length) : option.value,
            )
            .filter((value) => !value.startsWith('major:')),
        )
      : new Set<string>()
  const selectableOccupationIds =
    pendingChoiceOptions && isSelectingOccupation
      ? new Set(pendingChoiceOptions.map((option) => option.value))
      : new Set<string>()
  const selectableMajorIds =
    pendingChoiceOptions && isSelectingImprovementAny
      ? new Set(
          pendingChoiceOptions
            .map((option) =>
              option.value.startsWith('major:') ? option.value.slice('major:'.length) : option.value,
            )
            .filter((value) => availableMajorImprovements?.includes(value)),
        )
      : new Set<string>()

  const isBakeExchange =
    pendingChoice?.promptKey === 'ui.interactionBakeBreadChoice'
  const bakeExchangeSourceIds = isBakeExchange
    ? (pendingChoiceOptions ?? []).map((option) => option.value)
    : []
  const bakeExchangeInfo = buildBakeExchangeInfo(bakeExchangeSourceIds, getCardMeta)
  const cardLabel = useCallback((id: string) => {
    const improvementName = t(locale, `improvements.${id}.name`)
    if (improvementName !== `improvements.${id}.name`) {
      return improvementName.replace(/\s*[（(].*$/, '')
    }
    return getCardMeta(id)?.name ?? id
  }, [locale])

  const bakeExchangePlayer =
    isBakeExchange && pendingChoice && state
      ? state.players[pendingChoice.playerIndex]
      : null
  const bakeExchangeOptions = isBakeExchange
    ? (pendingChoiceOptions ?? []).filter(
        (option) => !!bakeExchangeInfo[option.value],
      )
    : []
  const bakeExchangeOptionIds = bakeExchangeOptions.map((option) => option.value)
  const activeBakeExchangeCounts = (() => {
    const counts: Record<string, number> = {}
    bakeExchangeOptionIds.forEach((value) => {
      counts[value] = bakeExchangeCounts[value] ?? 0
    })
    return counts
  })()

  const bakeTotalGrain = Object.values(activeBakeExchangeCounts).reduce(
    (sum, value) => sum + value,
    0,
  )
  const bakeTotalFood = Object.entries(activeBakeExchangeCounts).reduce(
    (sum, [id, count]) =>
      sum + (bakeExchangeInfo[id]?.food ?? 0) * count,
    0,
  )
  const hasBakeSelection = hasSelectedBakeGrain(activeBakeExchangeCounts)
  const baseFood = bakeExchangePlayer?.resources.food ?? 0
  const baseGrain = bakeExchangePlayer?.resources.grain ?? 0
  const summaryResources = {
    ...emptyResources,
    food: baseFood + bakeTotalFood,
    grain: Math.max(0, baseGrain - bakeTotalGrain),
  }
  const hasBakeSummary =
    summaryResources.food > 0 || summaryResources.grain > 0

  const isHarvestFeedExchange =
    interaction.stateId === 'wait' && interaction.request.kind === 'feed'
  const harvestFeedPlayer =
    isHarvestFeedExchange && state && interaction.stateId === 'wait'
      ? state.players[interaction.playerIndex] ?? null
      : null
  const harvestFeedOptions = useMemo(
    () =>
      harvestFeedPlayer
        ? buildHarvestFeedOptions(harvestFeedPlayer, locale, cardLabel)
        : [],
    [harvestFeedPlayer, locale, cardLabel],
  )
  const harvestFeedOptionIds = useMemo(
    () => harvestFeedOptions.map((option) => option.id),
    [harvestFeedOptions],
  )
  const activeHarvestFeedCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    harvestFeedOptionIds.forEach((id) => {
      counts[id] = harvestFeedCounts[id] ?? 0
    })
    return counts
  }, [harvestFeedCounts, harvestFeedOptionIds])

  const updateHarvestFeedCount = useCallback((id: string, delta: number) => {
    setHarvestFeedCounts((prev) => {
      const currentCounts: Record<string, number> = {}
      harvestFeedOptionIds.forEach((optionId) => {
        currentCounts[optionId] = prev[optionId] ?? 0
      })
      const current = currentCounts[id] ?? 0
      const option = harvestFeedOptions.find((entry) => entry.id === id)
      if (!option || !harvestFeedPlayer) return prev
      const max = computeHarvestFeedCounterMax(
        option,
        harvestFeedOptions,
        currentCounts,
        harvestFeedPlayer.resources,
      )
      const nextValue = Math.max(0, Math.min(current + delta, max))
      if (nextValue === current) return prev
      return { ...prev, [id]: nextValue }
    })
  }, [harvestFeedOptionIds, harvestFeedOptions, harvestFeedPlayer])

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
          count: activeHarvestFeedCounts[option.id] ?? 0,
          sourceName: option.sourceName,
          sourceId: option.sourceId,
          exchangeIndex: option.exchangeIndex,
          from: option.from,
          to: option.to,
        }))
        .filter((entry) => entry.count > 0),
    [activeHarvestFeedCounts, harvestFeedOptions],
  )
  const harvestFeedConvertedFood = useMemo(
    () =>
      harvestFeedSelections.reduce(
        (sum, entry) => sum + entry.count * ((entry.to.food as number) ?? 0),
        0,
      ),
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
      Object.entries(entry.from ?? {}).forEach(([k, v]) => {
        const key = k as keyof Resource
        resources[key] = (resources[key] ?? 0) + entry.count * ((v as number) ?? 0)
      })
    })
    resources.begging = harvestFeedBegging
    return resources
  }, [harvestFeedBegging, harvestFeedConvertedFood, harvestFeedSelections, harvestPending?.foodUsed])
  const hasHarvestFeedSummary = Object.values(harvestFeedSummary).some((value) => value > 0)
  const confirmHarvestFeed = useCallback(() => {
    if (!isInteractive) return
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'feed') return
    void transport.confirmFeed(interaction.playerIndex, harvestFeedSelections).catch((e) => console.error(e))
  }, [interaction, transport, isInteractive, harvestFeedSelections])

  const roomPositions = useMemo(() => new Set((displayPlayer?.roomTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos))), [displayPlayer?.roomTiles])
  const fieldPositions = useMemo(() => new Set((displayPlayer?.fields ?? []).map((f) => positionKey({ row: f.row, col: f.col }))), [displayPlayer?.fields])
  const fieldMap = useMemo(() => {
    const map = new Map<string, { stacks: CropStack[] }>()
    ;(displayPlayer?.fields ?? []).forEach((f) => { map.set(positionKey({ row: f.row, col: f.col }), { stacks: f.stacks }) })
    return map
  }, [displayPlayer?.fields])
  const stablePositions = useMemo(() => new Set((displayPlayer?.stableTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos))), [displayPlayer?.stableTiles])
  const existingFenceSet = useMemo(() => new Set((displayPlayer?.fenceSegments ?? []).map((s) => s.edge)), [displayPlayer?.fenceSegments])
  const pendingFenceSet = useMemo(() => new Set(pendingFenceEdges), [pendingFenceEdges])
  const pendingPalisadeSet = useMemo(() => new Set(pendingPalisadeEdges), [pendingPalisadeEdges])
  const displayPublicEventNotifications = useMemo(
    () => [...replayFeedback.notifications, ...publicEventNotifications].slice(0, 4),
    [publicEventNotifications, replayFeedback.notifications],
  )
  const displayPublicEventHighlights = useMemo(
    () => mergePublicEventHighlights(publicEventHighlights, replayFeedback.highlights),
    [publicEventHighlights, replayFeedback.highlights],
  )
  const displayPublicEventResourceAnimations = useMemo(
    () => mergePublicEventResourceAnimations(
      publicEventResourceAnimations,
      replayFeedback.resourceAnimations,
    ).slice(0, 12),
    [publicEventResourceAnimations, replayFeedback.resourceAnimations],
  )
  const highlightedActionIds = useMemo(
    () => new Set(displayPublicEventHighlights.actionIds),
    [displayPublicEventHighlights.actionIds],
  )
  const highlightedFarmTileKeys = useMemo(
    () => filterPublicFarmHighlightsForPlayer(displayPublicEventHighlights.farmTiles, displayPlayer?.id ?? ''),
    [displayPlayer?.id, displayPublicEventHighlights.farmTiles],
  )
  const highlightedFenceEdgeIds = useMemo(
    () => filterPublicFenceHighlightsForPlayer(displayPublicEventHighlights.fenceEdges, displayPlayer?.id ?? ''),
    [displayPlayer?.id, displayPublicEventHighlights.fenceEdges],
  )

  const farmInteraction =
    interaction.stateId === 'wait' ? interaction.farm ?? null : null
  const selectionInteraction =
    interaction.stateId === 'wait' ? interaction.selection ?? null : null

  const occupationHandInteraction = useMemo(
    () =>
      interaction.stateId === 'wait' &&
      interaction.selection &&
      interaction.selection.kind === 'occupation-hand'
        ? interaction.selection
        : null,
    [interaction],
  )

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
  const maxPositionSelections = useMemo(
    () =>
      selectionInteraction?.kind === 'farm-position'
        ? selectionInteraction.maxSelections
        : 0,
    [selectionInteraction],
  )
  const sowSelectedCount = Object.keys(pendingSowSelections).length
  const fenceErrorText: string | null = fenceError ? t(locale, `fence.error.${fenceError.code}`) : null
  const roomErrorText: string | null = roomError
    ? t(locale, farmCommitErrorMessageKey('room', roomError))
    : null
  const stableErrorText: string | null = stableError
    ? t(locale, farmCommitErrorMessageKey('stable', stableError))
    : null
  const plowErrorText: string | null = plowError
    ? t(locale, farmCommitErrorMessageKey('plow', plowError))
    : null
  const sowErrorText: string | null = sowError
    ? t(locale, farmCommitErrorMessageKey('sow', sowError))
    : null
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
    return buildPastureDisplayMap(displayPlayer, animalReorg)
  }, [displayPlayer, animalReorg])
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
    return buildStableDisplayMap(displayPlayer, animalReorg)
  }, [displayPlayer, animalReorg])

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
  const reorgRemaining = useMemo(() => reorgAvailable ? {
    sheep: Math.max(0, reorgAvailable.sheep - reorgTotals.sheep),
    boar: Math.max(0, reorgAvailable.boar - reorgTotals.boar),
    cattle: Math.max(0, reorgAvailable.cattle - reorgTotals.cattle),
  } : null, [reorgAvailable, reorgTotals])
  const confirmAnimalReorg = useCallback(() => {
    if (shouldShowAnimalDiscardPrompt(animalReorg, reorgRemaining)) {
      setAnimalReorg((prev) => prev ? { ...prev, confirmDiscard: true } : prev)
      return
    }
    resolveChoice('confirm')
  }, [animalReorg, reorgRemaining, resolveChoice])
  const roomSelectableSet = useMemo(
    () => {
      if (farmInteraction?.farmType !== 'room') return new Set<string>()
      return getCurrentlySelectableRoomKeys(
        farmInteraction.selectableTiles,
        roomPositions,
        new Set(pendingRoomTiles.map((tile) => positionKey(tile))),
      )
    },
    [farmInteraction, pendingRoomTiles, roomPositions],
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
  const positionSelectableSet = useMemo(
    () =>
      new Set(
        selectionInteraction?.kind === 'farm-position'
          ? selectionInteraction.selectablePositions.map((tile) => positionKey(tile))
          : [],
      ),
    [selectionInteraction],
  )
  const { sowSelectableMap, extraSowTargets } = useMemo(() => {
    const map = new Map<string, PendingSowCrop[]>()
    const extraTargets: ExtraSowTarget[] = []
    if (farmInteraction?.farmType !== 'sow') {
      return { sowSelectableMap: map, extraSowTargets: extraTargets }
    }
    farmInteraction.selectableFields.forEach((entry) => {
      const key = positionKey(entry.tile)
      if (isOffBoardSowTile(entry.tile)) {
        extraTargets.push({
          key,
          tile: entry.tile,
          allowedCrops: entry.allowedCrops,
          sourceCard: entry.sourceCard,
          groupKey: entry.groupKey,
        })
        return
      }
      map.set(key, entry.allowedCrops)
    })
    return { sowSelectableMap: map, extraSowTargets: extraTargets }
  }, [farmInteraction])
  const groupKeyByTile = useMemo(() => {
    const map = new Map<string, string | undefined>()
    if (farmInteraction?.farmType === 'sow') {
      farmInteraction.selectableFields.forEach((entry) => {
        map.set(positionKey(entry.tile), entry.groupKey)
      })
    }
    return map
  }, [farmInteraction])
  const wrappedToggleRoom = (tile: FarmTilePosition) =>
    toggleRoomTileInternal(tile, maxRoomSelections, positionKey)
  const wrappedToggleStable = (tile: FarmTilePosition) =>
    toggleStableTileInternal(tile, maxStableSelections, positionKey)
  const wrappedTogglePlow = (tile: FarmTilePosition) =>
    togglePlowTileInternal(tile, positionKey)
  const wrappedUpdateSow = (tile: FarmTilePosition, value: string) =>
    updateSowSelectionInternal(tile, value, maxSowSelections, positionKey, groupKeyByTile)
  const wrappedTogglePositionSelection = (tile: FarmTilePosition) =>
    togglePositionSelectionInternal(tile, maxPositionSelections, positionKey)
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
    wood: Math.max(0, (displayPlayer?.resources.wood ?? 0) - Object.values(pendingSowSelections).filter((v) => v === 'wood').length),
    stone: Math.max(0, (displayPlayer?.resources.stone ?? 0) - Object.values(pendingSowSelections).filter((v) => v === 'stone').length),
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

  // ── Right-column data mappings (Batch 3 Task 7) ───────────────────────────
  //
  // Map shared/domain/scoring.ts `PlayerScoreSummary` (one entry per player)
  // into the 5-bucket breakdown that ScorePanel expects. These are *estimates*
  // — spec explicitly says "估算分数" is OK for the live chip — so we collapse
  // related categories pragmatically:
  //
  //   fields  ← fields + grains + vegetables + pastures (everything farm-plot)
  //   animals ← sheeps + boars + cattles + stables
  //   food    ← cardsBonus (major-improvement food bonuses, e.g. Fireplace) + bonus VP
  //   family  ← farmers (rooms + family count VP)
  //   cards   ← cards (occupations + minors + majors printed VP)
  //
  // `scores` comes from useGameSync; falls back to empty map if absent.
  const scoreRows = useMemo<PlayerScoreRow[]>(() => {
    if (!state) return []
    const summaryById = new Map((scores ?? []).map((s) => [s.playerId, s]))
    const myId = selfPlayer?.id ?? null
    return state.players.map((p) => {
      const summary = summaryById.get(p.id)
      const catTotal = (key: string): number =>
        summary?.categories.find((c) => c.key === key)?.total ?? 0
      const breakdown = {
        fields:
          catTotal('fields') +
          catTotal('grains') +
          catTotal('vegetables') +
          catTotal('pastures'),
        animals:
          catTotal('sheeps') +
          catTotal('boars') +
          catTotal('cattles') +
          catTotal('stables'),
        food: catTotal('cardsBonus') + catTotal('cardStateBonusVp'),
        family: catTotal('farmers') + catTotal('clayRooms') + catTotal('stoneRooms'),
        cards: catTotal('cards'),
      }
      return {
        id: p.id,
        name: p.name,
        isYou: myId !== null && p.id === myId,
        total: summary?.total ?? 0,
        breakdown,
      }
    })
  }, [state, scores, selfPlayer?.id])

  const resourceKeys = resourceKeyList

  const applyDevResource = useCallback(async () => {
    if (!devPlayerId || !state) return
    const playerIndex = state.players.findIndex((p) => p.id === devPlayerId)
    if (playerIndex < 0) return
    const player = state.players[playerIndex]
    if (!player) return
    const delta = Number(devAmount ?? 0)
    const nextValue = Math.max(0, (player.resources[devResource] ?? 0) + delta)
    try {
      await transport.devSetResources(playerIndex, { [devResource]: nextValue })
    } catch (e) {
      console.error('applyDevResource error', e)
    }
  }, [devPlayerId, devResource, devAmount, state, transport])

  const applyDevRound = useCallback(() => {
    if (!state || !Number.isFinite(devRound)) return
    void transport.devSetRound(Math.max(1, Math.min(14, Math.floor(devRound)))).catch((e) => console.error('applyDevRound error', e))
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
    const clone = JSON.parse(JSON.stringify(state)) as import('../../shared/contract/types').GameState
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
      const raw = JSON.parse(String(result)) as import('../../shared/contract/types').GameState
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

  const notificationStack = privateEventNotifications.length > 0 || displayPublicEventNotifications.length > 0 ? (
    <div className="event-notifications" role="status" aria-live="polite">
      {buildEventNotificationStackItems(privateEventNotifications, displayPublicEventNotifications).map((notification) => (
        <div
          key={notification.id}
          className={notification.className}
          data-kind={notification.kind}
        >
          {notification.message}
        </div>
      ))}
    </div>
  ) : null

  // Card-draft phase — render the draft overlay instead of the game board.
  // The locked URL-pinned player wins in WS mode; otherwise fall back to the
  // sandbox "self" (current player) so HTTP debugging still works.
  if (state.phase === 'draft' && state.draft) {
    const meId = (isWs && localPlayerId) ? localPlayerId : (selfPlayer?.id ?? state.players[0]?.id ?? '')
    return (
      <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
        {notificationStack}
        <DraftOverlay
          state={state}
          meId={meId}
          locale={locale}
          onSubmit={async (pick) => {
            try {
              await transport.draftSubmit(meId, pick)
              // State update arrives via onSnapshot subscription — no manual refresh.
            } catch (e) {
              console.error('draftSubmit error', e)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
      {notificationStack}
      <PublicEventResourceAnimations
        animations={displayPublicEventResourceAnimations}
        displayPlayerId={displayPlayer.id}
        locale={locale}
      />
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
                  const current = activeHarvestFeedCounts[option.id] ?? 0
                  const limit = harvestFeedPlayer
                    ? computeHarvestFeedCounterMax(
                        option,
                        harvestFeedOptions,
                        activeHarvestFeedCounts,
                        harvestFeedPlayer.resources,
                      )
                    : 0
                  const canAdd = current < limit
                  const canSubtract = current > 0
                  const fromResources: Partial<Resource> = { ...emptyResources, ...option.from }
                  const toResources: Partial<Resource> = { ...emptyResources, ...option.to }
                  return (
                    <div
                      key={option.id}
                      className="exchange-row"
                      data-testid={`harvest-feed-option-${option.sourceId}-ex${option.exchangeIndex}`}
                    >
                      <div className="exchange-name">{option.sourceName}</div>
                      <div className="exchange-rate">
                        <span className="interaction-resource-exchange">
                          <ResourceLine
                            locale={locale}
                            resources={fromResources as Resource}
                            hideZero
                          />
                          <span className="interaction-resource-exchange-arrow" aria-hidden="true">
                            <span className="res-icon res-icon-arrow" />
                          </span>
                          <ResourceLine
                            locale={locale}
                            resources={toResources as Resource}
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
                  const current = activeBakeExchangeCounts[option.value] ?? 0
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
                    disabled={!hasBakeSelection}
                  >
                    {t(locale, 'ui.interactionConfirmButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showScoringPad ? <ScoringPad locale={locale} scores={scores ?? []} players={state.players} onClose={() => setShowScoringPad(false)} showDraftHistory={state.gameOver} /> : null}
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

      <div ref={headerRef}>
        <GameHeader
          locale={locale}
          state={state}
          currentPlayer={currentPlayer}
          devMode={devMode}
          setDevMode={setDevMode}
          myPlayerName={selfPlayer?.name ?? null}
          isMyTurn={isMyTurn}
        />
      </div>

      <MajorImprovements locale={locale} availableMajorImprovements={state.availableMajorImprovements} isSelectingMajor={isSelectingImprovementAny} selectableMajorIds={selectableMajorIds} cardAvailability={cardAvailability} resolveChoice={resolveChoice} futureCardResources={futureCardResources} isInteractive={isInteractive} devMode={devMode} />

      <div
        className="game-layout"
        style={{ '--game-header-height': `${headerHeight}px` } as CSSProperties}
      >
        <div className="game-layout__left">
          <section className="board-panel board-action">
            <ActionBoard locale={locale} baseActions={baseActions} roundSlots={roundSlots} currentPlayer={currentPlayer} players={state.players} futureMeeples={state.futureMeeples} canTakeAction={canTakeActionForBoard} takeAction={takeAction} currentRound={state.round} devMode={devMode} highlightedActionIds={highlightedActionIds} />
          </section>
        </div>
        <div className="game-layout__center">
          <StageBar currentRound={state.round ?? 1} />
          <PlayerTabs
            players={state.players.map((p, i) => ({
              id: p.id,
              name: p.name,
              // PlayerState has no `score` field — pull live total from
              // computeScores summary (falls back to 0 if unavailable).
              score: scoreRows.find((r) => r.id === p.id)?.total ?? 0,
              color: p.color,
              isYou: selfPlayer ? p.id === selfPlayer.id : false,
              isCurrent: i === state.currentPlayerIndex,
            }))}
            active={displayPlayer.id}
            onChange={setViewPlayerIdSafe}
          />
          <section className="board-panel board-farm">
            <PlayerFarmPanel locale={locale} state={state} viewedPlayerId={displayPlayer.id} devMode={devMode}
              currentStartPlayerId={state.players.find((p) => p.startPlayer)?.id ?? ''}
              nextStartPlayerId={state.players.find((p) => p.startPlayer)?.id ?? ''}
              playedCards={playedCards} farmCells={farmCells} roomPositions={roomPositions} fieldPositions={fieldPositions}
              fieldMap={fieldMap} stablePositions={stablePositions}
              pendingRoomSet={new Set(pendingRoomTiles.map((tp) => positionKey(tp)))}
              pendingStableSet={new Set(pendingStableTiles.map((tp) => positionKey(tp)))}
              roomSelectableSet={roomSelectableSet} stableSelectableSet={stableSelectableSet}
              maxStableSelections={maxStableSelections} plowSelectableSet={plowSelectableSet} pendingPlowTile={pendingPlowTile}
              positionSelectableSet={positionSelectableSet} pendingPositionSelections={pendingPositionSelections} togglePositionSelection={wrappedTogglePositionSelection}
              pendingSowSelections={pendingSowSelections} sowRemaining={sowRemaining} sowSelectableMap={sowSelectableMap} extraSowTargets={extraSowTargets} pastureTiles={pastureTiles}
              pastureDisplayMap={pastureDisplayMap} pastureCapacityMap={pastureCapacityMap} houseDisplay={houseDisplay}
              stableDisplayMap={stableDisplayMap} isReorgActive={isReorgActive} reorgRemaining={reorgRemaining}
              hasReorgOverflow={hasReorgOverflow} animalReorg={animalReorg} pendingFenceSet={pendingFenceSet} pendingPalisadeSet={pendingPalisadeSet}
              existingFenceSet={existingFenceSet} fenceSelectableSet={fenceSelectableSet}
              fencePlacementMode={fencePlacementMode}
              toggleRoomTile={wrappedToggleRoom} toggleStableTile={wrappedToggleStable}
              togglePlowTile={wrappedTogglePlow} updateSowSelection={wrappedUpdateSow}
              toggleFenceEdge={toggleFenceEdge} adjustReorgAnimal={adjustReorgAnimal}
              confirmAnimalReorg={confirmAnimalReorg} cancelAnimalDiscardPrompt={cancelAnimalDiscardPrompt}
              setViewPlayerId={setViewPlayerIdSafe} isSelectingMinor={isSelectingMinor} isSelectingOccupation={isSelectingOccupation}
              isSelectingImprovementAny={isSelectingImprovementAny} selectableMinorIds={selectableMinorIds}
              selectableOccupationIds={selectableOccupationIds} cardAvailability={cardAvailability} futureCardResources={futureCardResources} resolveChoice={resolveChoice}
              isInteractive={isInteractive}
              occupationHandSelection={occupationHandInteraction ?? undefined}
              highlightedFarmTileKeys={highlightedFarmTileKeys}
              highlightedFenceEdgeIds={highlightedFenceEdgeIds}
              onConfirmOccupationHandSelection={(ids) => {
                if (!isInteractive) return
                const pendingPlayerIndex =
                  interaction.stateId === 'wait' && interaction.selection ? interaction.playerIndex : 0
                void transport.commitSelection(pendingPlayerIndex, { cardIds: ids }).catch((e) => console.error(e))
              }}
            />
          </section>
        </div>
        <div className="game-layout__right">
          {isMobile ? (
            <>
              <Section collapsible defaultCollapsed icon="📊" title="计分" variant="parchment">
                <ScorePanel rows={scoreRows} />
              </Section>
              <Section collapsible defaultCollapsed icon="📜" title="行动记录" variant="parchment">
                <ActionLog
                  locale={locale}
                  log={state.log}
                  currentRound={state.round ?? 1}
                  timelineBuckets={actionLogTimelineBuckets}
                  selectedReplayKey={selectedReplayKey}
                  replayFilter={replayFilter}
                  replaySummary={replaySummary}
                  onReplayFilterChange={setReplayFilter}
                  onSelectReplayEntry={handleSelectReplayEntry}
                  onReplayStep={handleReplayStep}
                  onReplayPlayPause={handleReplayPlayPause}
                  onReplayLatest={handleReplayLatest}
                  isReplayPlaying={isReplayPlaying}
                />
              </Section>
            </>
          ) : (
            <>
              <ScorePanel rows={scoreRows} />
              <ActionLog
                locale={locale}
                log={state.log}
                currentRound={state.round ?? 1}
                timelineBuckets={actionLogTimelineBuckets}
                selectedReplayKey={selectedReplayKey}
                replayFilter={replayFilter}
                replaySummary={replaySummary}
                onReplayFilterChange={setReplayFilter}
                onSelectReplayEntry={handleSelectReplayEntry}
                onReplayStep={handleReplayStep}
                onReplayPlayPause={handleReplayPlayPause}
                onReplayLatest={handleReplayLatest}
                isReplayPlaying={isReplayPlaying}
              />
            </>
          )}
        </div>
      </div>

      <InteractionBar
        pendingAnimalReorg={pendingAnimalReorg} pendingChoice={pendingChoice}
        pendingEngineBlocked={pendingEngineBlocked}
        pendingNextPlayerIndex={pendingNextPlayerIndex} locale={locale}
        pendingPlayerSwitch={pendingPlayerSwitch}
        confirmPlayerSwitch={confirmPlayerSwitch}
        playerNames={state.players.map((p) => p.name ?? `Player ${p.id}`)}
        pendingRoomTilesLength={pendingRoomTiles.length} maxRoomSelections={maxRoomSelections}
        pendingStableTilesLength={pendingStableTiles.length} maxStableSelections={maxStableSelections}
        pendingSowSelectionsLength={sowSelectedCount}
        hasPendingPlowSelection={pendingPlowTile !== null}
        pendingPositionSelectionsLength={pendingPositionSelections.size} maxPositionSelections={maxPositionSelections}
        fenceErrorText={fenceErrorText ?? ''} roomErrorText={roomErrorText ?? ''}
        stableErrorText={stableErrorText ?? ''} plowErrorText={plowErrorText ?? ''} sowErrorText={sowErrorText ?? ''}
        isSelectingFences={isSelectingFences} isSelectingRooms={isSelectingRooms}
        isSelectingStables={isSelectingStables} isSelectingPlow={isSelectingPlow} isSelectingSow={isSelectingSow}
        resolveChoice={resolveChoice} confirmNextPlayer={confirmNextPlayer}
        harvestFeedPlayerName={harvestPending?.playerName ?? null} confirmHarvestFeed={confirmHarvestFeed}
        isInteractive={isInteractive}
        onUndo={undoStep}
        onUndoAction={undoAction}
        onShowScoring={() => setShowScoringPad(true)}
        historyLength={historyLength}
        hasActionStartSnapshot={hasActionStartSnapshot}
        anytimeActions={pendingEngineBlocked ? [] : interaction.anytimeActions}
        takeAnytimeAction={takeAnytimeAction}
        canBuildPalisades={!!currentPlayer && playerCanBuildPalisades(currentPlayer)}
        fencePlacementMode={fencePlacementMode}
        setFencePlacementMode={setFencePlacementMode}
        animalReorg={animalReorg}
        reorgRemaining={reorgRemaining}
        hasReorgOverflow={hasReorgOverflow}
        confirmAnimalReorg={confirmAnimalReorg}
        cancelAnimalDiscardPrompt={cancelAnimalDiscardPrompt}
        resourceQuantitySelect={
          interaction.stateId === 'wait' &&
          interaction.request.kind === 'resource-quantity-select'
            ? {
                availableByResource: interaction.request.availableByResource,
                promptKey: interaction.request.promptKey,
                onConfirm: (counts) => {
                  if (!isInteractive) return
                  void transport
                    .commitSelection(interaction.playerIndex, { resourceCounts: counts })
                    .catch((e) => console.error(e))
                },
                onCancel: () => {
                  if (!isInteractive) return
                  void transport.undoStep().catch((e) => console.error('undoStep error', e))
                },
              }
            : null
        }
        resourceBatchExchangeSelect={
          interaction.stateId === 'wait' &&
          interaction.request.kind === 'resource-batch-exchange-select'
            ? {
                discardAvailableByResource: interaction.request.discardAvailableByResource,
                receiveResources: interaction.request.receiveResources,
                maxTotal: interaction.request.maxTotal,
                promptKey: interaction.request.promptKey,
                onConfirm: (payload) => {
                  if (!isInteractive) return
                  void transport
                    .commitSelection(interaction.playerIndex, { resourceBatchExchange: payload })
                    .catch((e) => console.error(e))
                },
                onCancel: () => {
                  if (!isInteractive) return
                  void transport.undoStep().catch((e) => console.error('undoStep error', e))
                },
              }
            : null
        }
      />
    </div>
  )
}
