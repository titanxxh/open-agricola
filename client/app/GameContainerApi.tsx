import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from '../utils/platform-page-url'
import type { ActionSpace, FarmTilePosition, InteractionCommand, PlayerState, Resource } from '../../shared/contract/types'
import { t, type Locale } from '../../shared/i18n'
import { getPlayerDisplayName } from '../utils/player-name'
import {
  positionKey,
} from '../../shared/domain/farm'
import { useGameSync } from '../hooks/useGameSync'
import { useRoomHistory } from '../hooks/useRoomHistory'
import { HttpGameTransport, WsGameTransport, type GameTransport } from '../services/gameTransport'
import { isHotseatSetupQuery, parseDraftParamsFromQuery } from './game-setup-query'
import { LocalGameTransport } from '../local-sandbox/local-transport'
import { HotseatHandoff } from './HotseatHandoff'
import { nextHotseatDraftSeatId, nextHotseatParentSeatId } from './hotseat-seat'
import { isBrowserSandbox, readLocalSandboxConfig } from '../local-sandbox/workshop-launch'
import { createDebouncedSaver, loadResumable, openLocalGameStore } from '../local-sandbox/persistence'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../shared/moor/types'
import { isMoorTerrainAction } from '../../shared/projections/moor-special-actions'
import { playerCanBuildPalisades } from '../utils/player-palisades'
import { DevPanel } from '../components/dev/DevPanel'
import { ActionBoard } from '../components/board/ActionBoard'
import { SeasonsBoard } from '../components/board/SeasonsBoard'
import { PlayerFarmPanel } from '../components/board/PlayerFarmPanel'
import { SpecialActionsPanel } from '../components/board/SpecialActionsPanel'
import { MajorImprovements } from '../components/board/MajorImprovements'
import { ScoringPad } from '../components/board/ScoringPad'
import { StageBar } from '../components/board/StageBar'
import { PlayerTabs } from '../components/board/PlayerTabs'
import { ScorePanel } from '../components/board/ScorePanel'
import { ActionLog } from '../components/board/ActionLog'
import { GameHeader } from '../components/header/GameHeader'
import { InteractionBar } from '../components/interaction/InteractionBar'
import { BrandMark } from '../components/common/BrandMark'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { getGameLoadProgress, resolveGameLoadPhase } from './game-load-progress'
import { buildActionBoardProjection, buildFarmBoardProjection } from './farm-board-projection'
import { Section } from '../components/common/Section'
import { PublicEventResourceAnimations } from '../components/effects/PublicEventResourceAnimations'
import { PublicEventCardPassAnimation } from '../components/effects/PublicEventCardPassAnimation'
import { DraftOverlay } from './draft/DraftOverlay'
import { ParentSelectionOverlay } from './parents/ParentSelectionOverlay'
import { OrdinaryCardDrawOverlay } from './parents/OrdinaryCardDrawOverlay'
import { useAnimalReorgDraftPresentation } from './animal-reorg-draft-presentation'
import { ExchangeOverlayPresentation } from './exchange-overlay-presentation'
import { useExchangeDraftPresentation } from './exchange-draft-presentation'
import { useFarmSelectionDraftPresentation } from './farm-selection-draft-presentation'
import { getCardMeta } from '../services/card-meta'
import {
  buildCompactScoreRows,
  buildPendingMoorSpecialActionChoiceMaps,
  buildPlaceFarmerChoiceMap,
  buildSelectableMajorIds,
  buildSelectableMinorIds,
  buildSelectableOccupationIds,
  allowIncompleteFarmersOfTheMoorMinorDealFromQuery,
  canTakeVisibleMoorSpecialAction,
  enableFarmersOfTheMoorFromQuery,
  enableSnakeOpeningFromQuery,
  enableThroughTheSeasonsFromQuery,
  devResourceKeysForState,
  getPendingMoorSpecialActionChoice,
  getPendingMoorSpecialActionTileChoice,
  getPendingMoorSpecialActionTileKeys,
  hasPendingMoorSpecialActionChoice,
  isDevModeAllowedFromQuery,
  maxPlayersFromQuery,
  requestedWsPlayerIdFromQuery,
  playerIdFromWsStatus,
  shouldShowDevPanel,
  splitBoardActionSpaces,
  type FarmCommitType,
  type WsStatus,
} from './game-container-helpers'
import type { WsErrorCode } from './ws-status'
import {
  collectPrivateEventNotifications,
  type PrivateEventNotification,
} from './private-event-notifications'
import {
  buildEventNotificationStackItems,
} from './public-event-notifications'
import { usePublicEventCuePresentation } from './public-event-cue-presentation'
import {
  buildReplayActionLogPresentation,
  type ReplayTimelineEntry,
  type ReplayTimelineFilter,
} from './replay-action-log-presentation'
import {
  buildInteractionPresentationPlan,
  buildInteractionSubmitCommand,
  interactionChoiceOptions,
  isDomainWaitInteraction,
  type InteractionSubmitCommand,
  type InteractionSubmitDraft,
} from './interaction-presentation'
import {
  buildInteractionBarActions,
  buildInteractionBarModel,
} from './interaction-bar-presentation'
import { GAME_CONTEXT_CHANGED_EVENT } from './GameContextRouter'
import { BugReportBar } from './BugReportBar'

type RoundSlot = { round: number; action?: ActionSpace }
type SelectedSpecialAction = { cardId: string; actionId: MoorSpecialActionId } | null

const httpTransportSingleton = new HttpGameTransport()

/** Update browser URL to include room= so the link can be shared; same room id = same game. */
const setRoomInUrl = (roomId: string) => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.delete('card')
  if (params.has('context')) {
    params.set('context', roomId)
    params.delete('room')
  } else {
    params.set('room', roomId)
  }
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

const useTransportSetup = (
  playerParam: string | null,
  displayName: string | undefined,
  isWsMode: boolean,
  locale: Locale,
  isLocalMode: boolean,
  ownerKey: string,
) => {
  const [wsStatus, setWsStatus] = useState<WsStatus>({ phase: 'idle' })
  const [wsTransport, setWsTransport] = useState<WsGameTransport | null>(null)
  const [wsReady, setWsReady] = useState(false)
  const [localTransport, setLocalTransport] = useState<LocalGameTransport | null>(null)
  const [localReady, setLocalReady] = useState(false)

  const initRef = useRef(false)
  const [recoveryNotice, setRecoveryNotice] = useState(false)
  const playerIndexRef = useRef(0)

  useEffect(() => {
    if (!isLocalMode || initRef.current) return
    initRef.current = true

    const config = readLocalSandboxConfig(ownerKey)
    if (!config) {
      window.alert(t(locale, 'platform.localSandboxMissingConfig'))
      return
    }
    const store = openLocalGameStore(ownerKey)
    const saver = createDebouncedSaver(store)
    const transport = new LocalGameTransport(config, {
      viewer: { viewerPlayerId: null, mode: 'debug' },
      onPersist: saver.push,
      onRecovered: () => { window.alert(t(locale, 'platform.localSandboxTimeout')) },
    })
    window.addEventListener('pagehide', () => { void saver.flush() })

    // An explicit "restart" (freshSandbox=1) drops any saved slot and starts
    // clean instead of offering to resume the previous game.
    const forceFresh = new URLSearchParams(window.location.search).get('freshSandbox') === '1'

    const init = async () => {
      try {
        // Clearing the optional slot is best-effort: a storage-disabled context
        // must not block starting a fresh in-memory game.
        if (forceFresh) {
          try { await store.clear() } catch { /* ignore */ }
          // Consume the flag so a later reload of this frame (manual or the
          // stale-chunk recovery path) resumes the restarted game instead of
          // clearing its snapshots again.
          const params = new URLSearchParams(window.location.search)
          params.delete('freshSandbox')
          const q = params.toString()
          window.history.replaceState(null, '', `${window.location.pathname}${q ? '?' + q : ''}${window.location.hash}`)
        }
        const persisted = forceFresh ? null : await loadResumable(store)
        if (persisted && window.confirm(t(locale, 'platform.localSandboxResume'))) {
          try {
            await transport.startFromPersisted(persisted)
          } catch {
            await store.clear()
            await transport.start()
          }
        } else {
          if (persisted) await store.clear()
          await transport.start()
        }
        setLocalTransport(transport)
        setLocalReady(true)
      } catch (err) {
        console.error('[local-sandbox] failed to start:', err)
        window.alert(err instanceof Error ? err.message : String(err))
      }
    }
    void init()
  }, [isLocalMode, locale])

  useEffect(() => {
    if (isLocalMode || !isWsMode || initRef.current) return
    initRef.current = true
    const params = new URLSearchParams(window.location.search)
    const contextRoomId = params.get('context')
    const roomId = contextRoomId ?? params.get('room')
    const ws = new WsGameTransport(undefined, roomId ?? undefined, toRequestedPlayerIndex(playerParam))
    const hadPendingCommands = ws.recoveringCommands
    let hotseat = false
    let receivedRoom = false
    let snapshotRoomId: string | undefined
    let waiting: Extract<WsStatus, { phase: 'waiting' }> | undefined
    let disposed = false
    const ready = () => {
      if (disposed) return
      if (waiting) { setWsReady(false); setWsStatus(waiting); return }
      setWsReady(true)
      setWsStatus({ phase: 'ready', roomId: ws.roomId, playerIndex: ws.playerIndex, ...(hotseat ? { hotseat: true } : {}) })
    }
    setWsTransport(ws)
    const offStatus = ws.onConnectionStatus(status => {
      if (disposed) return
      if (status.phase === 'connecting' || status.phase === 'reconnecting' || status.phase === 'recovering') {
        snapshotRoomId = undefined
        setWsReady(false)
        setWsStatus({ phase: status.phase === 'connecting' ? 'connecting' : 'reconnecting' })
      } else if (status.phase === 'stopped') {
        setWsReady(false)
        setWsStatus({ phase: 'error', message: status.message, code: status.code as WsErrorCode | undefined })
      } else if (status.phase === 'ready') ready()
    })
    const offRecovery = ws.onRecoveryNotice(() => setRecoveryNotice(true))
    const offEvent = ws.onEvent(msg => {
      if (disposed) return
      if (msg.type === 'roomCreated' || msg.type === 'roomJoined') {
        receivedRoom = true
        setRoomInUrl(msg.roomId)
        playerIndexRef.current = msg.playerIndex
        hotseat = msg.hotseat === true
        if (msg.type === 'roomCreated' || msg.status === 'waiting') {
          waiting = { phase: 'waiting', roomId: msg.roomId, players: msg.type === 'roomCreated' ? [{ playerIndex: msg.playerIndex, name: displayName ?? '' }] : msg.players, maxPlayers: msg.maxPlayers }
          setWsReady(false)
          setWsStatus(waiting)
        } else {
          waiting = undefined
          setWsStatus({ phase: 'joining', roomId: msg.roomId })
        }
      } else if (msg.type === 'roomWaiting') {
        setRoomInUrl(msg.roomId)
        waiting = { phase: 'waiting', roomId: msg.roomId, players: msg.players, maxPlayers: msg.maxPlayers }
        setWsReady(false)
        setWsStatus(waiting)
      } else if (msg.type === 'playerJoined' && waiting) {
        waiting = { ...waiting, players: [...waiting.players.filter(player => player.playerIndex !== msg.playerIndex), { playerIndex: msg.playerIndex, name: msg.name }].sort((a, b) => a.playerIndex - b.playerIndex), maxPlayers: msg.maxPlayers }
        setWsStatus(waiting)
      } else if (msg.type === 'gameStarted') {
        waiting = undefined
        if (snapshotRoomId === ws.roomId && ws.connected) ready()
        else setWsStatus({ phase: 'joining', roomId: ws.roomId })
      } else if (msg.type === 'stateUpdate' && msg.sync === 'snapshot') {
        waiting = undefined
        snapshotRoomId = msg.roomId
        setRoomInUrl(msg.roomId)
        if (ws.connected) ready()
      } else if (msg.type === 'error' && !ws.connected) {
        if (contextRoomId && (msg.code === 'context_changed' || msg.code === 'not_participant')) window.dispatchEvent(new Event(GAME_CONTEXT_CHANGED_EVENT))
        if (msg.code !== 'command_pending') setWsStatus({ phase: 'error', message: msg.error, code: msg.code })
      } else if (msg.type === 'error' && !receivedRoom) {
        setWsStatus({ phase: 'error', message: msg.error, code: msg.code })
      }
    })
    const init = async () => {
      try {
        await ws.connect()
        if (disposed || hadPendingCommands) return
        if (roomId) {
          setWsStatus({ phase: 'joining', roomId })
          ws.sendRoomCommand('joinRoom', { roomId, intent: contextRoomId ? 'resume' : 'join', name: displayName ?? '', requestedPlayerIndex: toRequestedPlayerIndex(playerParam) })
        } else if (!playerParam || playerParam === 'p1') {
          setWsStatus({ phase: 'creating' })
          ws.sendRoomCommand('createRoom', {
            maxPlayers: maxPlayersFromQuery(window.location.search),
            name: displayName ?? '',
            customCardIds: params.get('customCards')?.split(',').filter(Boolean),
            hotseat: isHotseatSetupQuery(window.location.search) || undefined,
            enableCommunityDeck: params.get('enableCommunityDeck') === 'true' || undefined,
            enableParentCards: params.get('enableParentCards') === 'true' || undefined,
            draftParents: params.get('draftParents') === 'false' ? false : undefined,
            enableThroughTheSeasons: enableThroughTheSeasonsFromQuery(window.location.search) || undefined,
            enableFarmersOfTheMoor: enableFarmersOfTheMoorFromQuery(window.location.search) || undefined,
            allowIncompleteFarmersOfTheMoorMinorDeal: allowIncompleteFarmersOfTheMoorMinorDealFromQuery(window.location.search) || undefined,
            enableSnakeOpening: enableSnakeOpeningFromQuery(window.location.search) || undefined,
            ...parseDraftParamsFromQuery(window.location.search),
          })
        } else setWsStatus({ phase: 'error', message: 'No room in URL. Use the link shared by Player 1.' })
      } catch (error) {
        if (!disposed) setWsStatus({ phase: 'error', message: error instanceof Error ? error.message : 'WebSocket connection failed' })
      }
    }
    void init()
    return () => { disposed = true; offStatus(); offEvent(); offRecovery(); ws.destroy(); initRef.current = false }
  }, [displayName, isLocalMode, isWsMode, playerParam])

  const transport: GameTransport = isLocalMode
    ? (localTransport ?? httpTransportSingleton)
    : isWsMode && wsTransport ? wsTransport : httpTransportSingleton
  const isReady = isLocalMode ? localReady : (!isWsMode || wsReady)
  return { transport, wsStatus, isWs: isWsMode, isReady, wsTransport, recoveryNotice, clearRecoveryNotice: () => setRecoveryNotice(false) }
}

const getIsMobileViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(max-width: 900px)').matches

export const GameContainerApi = () => {
  // Read URL params fresh on each render (navigated here from lobby — don't use module-level stale values)
  const currentUrlParams = new URLSearchParams(window.location.search)
  const contextRoomId = currentUrlParams.get('context')
  // Gate on the configured executor too, so flipping VITE_SANDBOX_EXECUTOR back
  // to 'server' is an effective kill switch: a reload of an already-open
  // localSandbox=1 tab (new bundle) no longer runs custom code in the browser.
  const isLocalMode = currentUrlParams.get('localSandbox') === '1' && isBrowserSandbox()
  const isWsMode = !isLocalMode && (contextRoomId !== null || currentUrlParams.get('transport') === 'ws')
  const isEmbedded = currentUrlParams.get('embedded') === '1'
  // Seat whose cards the person at the device has agreed to look at, during
  // the draft / parent-selection phases (see `hotseat-seat.ts`).
  const [hotseatSeatConfirmed, setHotseatSeatConfirmed] = useState<string | null>(null)

  const requestedPlayerId = useMemo(() => requestedWsPlayerIdFromQuery(window.location.search), [])
  const lockedViewPlayerId = contextRoomId === null ? requestedPlayerId : null
  const { locale } = useLocale()
  const { user } = useAuth()
  const { transport, wsStatus, isWs, isReady, wsTransport, recoveryNotice, clearRecoveryNotice } = useTransportSetup(
    requestedPlayerId,
    user?.displayName,
    isWsMode,
    locale,
    isLocalMode,
    user?.id ?? 'anon',
  )
  const { state, interaction, scores, pastureCapacities, historyLength, hasActionStartSnapshot, actionAvailability, cardAvailability, privateEvents, historyWindow, applySnapshot } =
    useGameSync()
  const roomHistory = useRoomHistory(transport, state, historyWindow)
  const privateEventNotificationBatchSeqRef = useRef(0)
  const privateEventNotificationTimersRef = useRef<number[]>([])
  const [privateEventNotifications, setPrivateEventNotifications] = useState<PrivateEventNotification[]>([])
  const [persistencePaused, setPersistencePaused] = useState(false)
  const [replayFilter, setReplayFilter] = useState<ReplayTimelineFilter>('all')
  const [selectedReplayKey, setSelectedReplayKey] = useState<string | null>(null)
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(lockedViewPlayerId)
  const [showScoringPad, setShowScoringPad] = useState(false)
  const [dismissedGameOverScoringKey, setDismissedGameOverScoringKey] = useState<string | null>(null)
  const [devMode, setDevMode] = useState(() => isDevModeAllowedFromQuery(window.location.search))
  const [selectedSpecialAction, setSelectedSpecialAction] = useState<SelectedSpecialAction>(null)
  const [inviteCopyStatus, setInviteCopyStatus] = useState<'success' | 'error' | null>(null)
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

  const clearReplayCue = useCallback(() => {
    setSelectedReplayKey(null)
  }, [])

  useEffect(() => () => {
    privateEventNotificationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    privateEventNotificationTimersRef.current = []
  }, [])

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

  const currentPlayer = state?.players[state.currentPlayerIndex] ?? null
  const defaultDevPlayerId = viewPlayerId ?? currentPlayer?.id ?? ''
  const devPlayerId = devPlayerIdOverride ?? defaultDevPlayerId
  const setDevPlayerId = useCallback((value: string) => {
    setDevPlayerIdOverride(value)
  }, [])
  const wsAssignedPlayerId = isWs ? playerIdFromWsStatus(wsStatus) : null
  // One connection holds every seat, as confirmed by the server's room answer.
  const isHotseat = wsStatus.phase === 'ready' && wsStatus.hotseat === true
  const localPlayerId = lockedViewPlayerId ?? wsAssignedPlayerId
  // In WS mode, selfPlayer is locked to the URL ?player= param.
  // If the URL omits ?player=, use the seat assigned by the join/create handshake.
  // In HTTP mode (sandbox/single-player), selfPlayer follows the current player.
  const selfPlayer = isWs && localPlayerId && !isHotseat
    ? state?.players.find((p) => p.id === localPlayerId) ?? currentPlayer
    : currentPlayer
  const viewedPlayer = state?.players.find((p) => p.id === viewPlayerId) ?? selfPlayer ?? currentPlayer
  // In WS mode, viewPlayerId lets you peek at another player's board.
  // In HTTP (sandbox) mode, display follows the current player so the panel switches on turn change.
  const activePlayer =
    interaction.stateId === 'wait' && typeof interaction.playerIndex === 'number'
      ? state?.players[interaction.playerIndex] ?? currentPlayer
      : currentPlayer
  // Hotseat follows the seat that actually has to act: a pending interaction can
  // belong to someone other than the current player (harvest feeding walks the
  // harvest order without advancing currentPlayerIndex), and that seat is the
  // one whose cards may be shown — and who the device has to be handed to.
  const displayPlayer = isHotseat
    ? (activePlayer ?? currentPlayer ?? state?.players[0] ?? null)
    : isWs
      ? ((viewPlayerId ? viewedPlayer : selfPlayer ?? currentPlayer) ?? state?.players[0] ?? null)
      : (selfPlayer ?? currentPlayer ?? state?.players[0] ?? null)
  const isMyTurn = !!(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)
  // In HTTP (non-WS) mode, one human controls all players — always interactive
  const isInteractive = isHotseat
    ? !persistencePaused && (!isWs || wsStatus.phase === 'ready') && !!(activePlayer && displayPlayer)
    : isWs
      ? !persistencePaused && (!isWs || wsStatus.phase === 'ready') && !!(activePlayer && selfPlayer && displayPlayer &&
           activePlayer.id === selfPlayer.id && displayPlayer.id === selfPlayer.id)
      : !!(activePlayer && displayPlayer)
  const hasGameView = !!(state && currentPlayer && displayPlayer)
  const bugReportRoomId = isWs && wsStatus.phase === 'ready'
    ? wsStatus.roomId
    : null
  const bugReportBar = bugReportRoomId
    ? <BugReportBar roomId={bugReportRoomId} />
    : null

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

  const placeFarmerChoiceBySpaceId = useMemo(
    () =>
      isDomainWaitInteraction(interaction)
        ? buildPlaceFarmerChoiceMap(interaction.promptKey, interactionChoiceOptions(interaction))
        : new Map(),
    [interaction],
  )
  const interactionPresentationPlan = useMemo(
    () => buildInteractionPresentationPlan(interaction),
    [interaction],
  )
  const highlightedHandCardId =
    isInteractive && interaction.stateId === 'wait' && typeof interaction.promptParams?.cardId === 'string'
      ? interaction.promptParams.cardId
      : undefined
  const pendingMoorSpecialActionChoices = useMemo(
    () =>
      interactionPresentationPlan.kind === 'moor-special-action'
        ? interactionPresentationPlan.choices
        : buildPendingMoorSpecialActionChoiceMaps(),
    [interactionPresentationPlan],
  )
  const farmSelectionDraft = useFarmSelectionDraftPresentation({
    interactionPresentationPlan,
    locale,
    displayPlayer,
    players: state?.players,
  })
  const farmInteraction = farmSelectionDraft.farmInteraction
  const selectionInteraction = farmSelectionDraft.selectionInteraction
  const occupationHandInteraction = farmSelectionDraft.occupationHandInteraction
  const setFarmDraftCommitError = farmSelectionDraft.setCommitError
  const setFarmDraftSubmitError = farmSelectionDraft.setSubmitError
  const resetFarmSelectionDraft = farmSelectionDraft.reset
  const pendingAnimalReorg = useMemo(
    () =>
      interactionPresentationPlan.kind === 'animal-reorg'
        ? {
            playerIndex: interactionPresentationPlan.playerIndex,
            spaceId: interactionPresentationPlan.spaceId,
          }
        : null,
    [interactionPresentationPlan],
  )
  const animalReorgDraft = useAnimalReorgDraftPresentation({
    state,
    pendingAnimalReorg,
  })
  const {
    animalReorg,
    isActive: isReorgActive,
    hasReorgOverflow,
    submitDraft: animalReorgSubmitDraft,
    syncFromInteraction: syncAnimalReorgFromInteraction,
    controls: {
      adjustAnimal: adjustReorgAnimal,
      confirm: confirmAnimalReorgDraft,
      cancelDiscardPrompt: cancelAnimalDiscardPrompt,
    },
  } = animalReorgDraft
  const isInteractionSubmitDraftRejected = useCallback((draft: InteractionSubmitDraft) =>
    buildInteractionSubmitCommand(interaction, draft).kind === 'rejected', [interaction])

  const takeAction = useCallback((space: ActionSpace) => {
    if (!state || !isInteractive) return
    if (interaction.stateId === 'wait') {
      const option = placeFarmerChoiceBySpaceId.get(space.id)
      if (!option || option.disabled) return
      void transport.resolveChoice(interaction.playerIndex, option.value).catch((e) => console.error(e))
      return
    }
    if (interaction.stateId !== 'idle') return
    void transport.takeAction(state.currentPlayerIndex, space.id).catch((e) => console.error('takeAction error', e))
  }, [state, transport, isInteractive, interaction, placeFarmerChoiceBySpaceId])

  const allowedCommands = interaction.allowedCommands as readonly InteractionCommand[]
  const canUndoStep = allowedCommands.includes('undoStep')
  const canUndoAction = allowedCommands.includes('undoAction')
  const gameOverScoringKey = state?.gameOver
    ? `${bugReportRoomId ?? state.gameSeed ?? ''}:${state.round}:${state.nextEventSeq}`
    : null
  const shouldShowScoringPad =
    showScoringPad || (gameOverScoringKey !== null && dismissedGameOverScoringKey !== gameOverScoringKey)
  const showScoring = useCallback(() => {
    setDismissedGameOverScoringKey(null)
    setShowScoringPad(true)
  }, [])
  const closeScoring = useCallback(() => {
    if (gameOverScoringKey !== null) setDismissedGameOverScoringKey(gameOverScoringKey)
    setShowScoringPad(false)
  }, [gameOverScoringKey])

  const undoStep = useCallback(() => {
    if (!isInteractive || !canUndoStep) return
    void transport.undoStep().catch((e) => console.error('undo error', e))
  }, [transport, isInteractive, canUndoStep])

  const undoAction = useCallback(() => {
    if (!isInteractive || !canUndoAction) return
    void transport.undoAction().catch((e) => console.error('undoAction error', e))
  }, [transport, isInteractive, canUndoAction])

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

  const canTakeSpecialAction = useCallback((card: MoorSpecialActionCardState, actionId: MoorSpecialActionId) => {
    if (!state || !currentPlayer || !isInteractive) return false
    if (interaction.stateId === 'wait' && pendingMoorSpecialActionChoices.isActive) {
      return hasPendingMoorSpecialActionChoice(pendingMoorSpecialActionChoices, card.id, actionId)
    }
    if (interaction.stateId !== 'idle') return false
    return canTakeVisibleMoorSpecialAction(state, currentPlayer, card, actionId)
  }, [currentPlayer, interaction.stateId, isInteractive, pendingMoorSpecialActionChoices, state])

  const takeImmediateSpecialAction = useCallback((cardId: string, actionId: MoorSpecialActionId) => {
    if (!state || !isInteractive) return
    if (interaction.stateId === 'wait' && pendingMoorSpecialActionChoices.isActive) {
      const option = getPendingMoorSpecialActionChoice(pendingMoorSpecialActionChoices, cardId, actionId)
      if (!option) return
      void transport.resolveChoice(interaction.playerIndex, option.value).catch((e) => {
        console.error('resolveChoice error', e)
      })
      return
    }
    if (interaction.stateId !== 'idle') return
    void transport.takeSpecialAction(state.currentPlayerIndex, cardId, actionId).catch((e) => {
      console.error('takeSpecialAction error', e)
    })
  }, [interaction, isInteractive, pendingMoorSpecialActionChoices, state, transport])

  const selectTerrainSpecialAction = useCallback((cardId: string, actionId: MoorSpecialActionId) => {
    setSelectedSpecialAction((current) =>
      current?.cardId === cardId && current.actionId === actionId
        ? null
        : { cardId, actionId },
    )
  }, [])

  const takeSpecialAction = useCallback((cardId: string, actionId: MoorSpecialActionId) => {
    if (isMoorTerrainAction(actionId)) {
      selectTerrainSpecialAction(cardId, actionId)
      return
    }
    takeImmediateSpecialAction(cardId, actionId)
  }, [selectTerrainSpecialAction, takeImmediateSpecialAction])

  const setFarmCommitError = useCallback((farmType: FarmCommitType, error?: string) => {
    setFarmDraftCommitError(farmType, error)
  }, [setFarmDraftCommitError])

  const setLocalFarmSubmitError = useCallback((
    farmType: FarmCommitType,
    error: string | { code: string; edges: string[]; newEdges: string[] },
  ) => {
    setFarmDraftSubmitError(farmType, error)
  }, [setFarmDraftSubmitError])

  const runInteractionSubmitCommand = useCallback((
    submitCommand: InteractionSubmitCommand,
    farmType?: FarmCommitType,
  ) => {
    if (submitCommand.kind === 'none') return false
    if (submitCommand.kind === 'rejected') return true
    if (submitCommand.kind === 'undoStep') {
      void transport.undoStep().catch((e) => console.error('undoStep error', e))
      return true
    }
    if (submitCommand.kind === 'localFarmError') {
      setLocalFarmSubmitError(submitCommand.farmType, submitCommand.error)
      return true
    }
    if (submitCommand.kind === 'commitSelection') {
      void transport.commitSelection(submitCommand.playerIndex, submitCommand.payload)
        .then((resp) => {
          if (!resp.ok && farmType) setFarmCommitError(farmType, resp.error)
        })
        .catch((e) => {
          console.error(e)
          if (farmType) setFarmCommitError(farmType)
        })
      return true
    }
    if (submitCommand.kind === 'resolveChoice') {
      void transport
        .resolveChoice(submitCommand.playerIndex, submitCommand.value, submitCommand.payload)
        .catch((e) => console.error(e))
      return true
    }
    if (submitCommand.kind === 'confirmFeed') {
      void transport
        .confirmFeed(submitCommand.playerIndex, submitCommand.selections)
        .catch((e) => console.error(e))
      return true
    }
    if (submitCommand.kind === 'confirmNextPlayer') {
      void transport.confirmNextPlayer().catch((e) => console.error(e))
      return true
    }
    void transport.confirmPlayerSwitch().catch((e) => console.error(e))
    return true
  }, [setFarmCommitError, setLocalFarmSubmitError, transport])

  const resolveChoice = useCallback((value: string) => {
    if (!isInteractive) return
    if (!currentPlayer) return
    const submitCommand = buildInteractionSubmitCommand(interaction, {
      value,
      ...farmSelectionDraft.submitDraft,
      ...animalReorgSubmitDraft,
    })
    const farmType =
      interactionPresentationPlan.kind === 'farm-fence-selection' ||
      interactionPresentationPlan.kind === 'farm-room-selection' ||
      interactionPresentationPlan.kind === 'farm-stable-selection' ||
      interactionPresentationPlan.kind === 'farm-plow-selection' ||
      interactionPresentationPlan.kind === 'farm-sow-selection'
        ? interactionPresentationPlan.farm.farmType
        : undefined
    if (runInteractionSubmitCommand(submitCommand, farmType)) {
      return
    }
    if (
      interactionPresentationPlan.kind !== 'choice-bar' &&
      interactionPresentationPlan.kind !== 'exchange-center' &&
      interactionPresentationPlan.kind !== 'moor-special-action'
    ) {
      return
    }
    void transport
      .resolveChoice(interactionPresentationPlan.pendingChoice.playerIndex, value)
      .catch((e) => console.error(e))
  }, [interaction, interactionPresentationPlan, currentPlayer, animalReorgSubmitDraft, farmSelectionDraft.submitDraft, transport, isInteractive, runInteractionSubmitCommand])

  const confirmNextPlayer = useCallback(() => {
    if (!isInteractive) return
    const submitCommand = buildInteractionSubmitCommand(interaction, { value: 'confirm' })
    if (runInteractionSubmitCommand(submitCommand)) return
    void transport.confirmNextPlayer().catch((e) => console.error(e))
  }, [interaction, runInteractionSubmitCommand, transport, isInteractive])
  const confirmPlayerSwitch = useCallback(() => {
    if (!isInteractive) return
    const submitCommand = buildInteractionSubmitCommand(interaction, { value: 'confirm' })
    if (runInteractionSubmitCommand(submitCommand)) return
    void transport.confirmPlayerSwitch().catch((e) => console.error(e))
  }, [interaction, runInteractionSubmitCommand, transport, isInteractive])
  const resetGame = useCallback(() => {
    if (!isInteractive) return
    const seed = resetSeedInput ? Number(resetSeedInput) : undefined
    void transport.newGame(Number.isFinite(seed) ? seed : undefined).catch((e) => console.error(e))
  }, [transport, isInteractive, resetSeedInput])

  const pendingEngineBlocked =
    interactionPresentationPlan.kind === 'engine-blocked'
      ? {
          promptKey: interactionPresentationPlan.promptKey,
          promptParams: interactionPresentationPlan.promptParams,
        }
      : null
  const planPendingChoice =
    'pendingChoice' in interactionPresentationPlan
      ? interactionPresentationPlan.pendingChoice
      : null
  const pendingChoice = planPendingChoice
  const currentSelectionRejected = isInteractionSubmitDraftRejected({
    value: 'confirm',
    ...farmSelectionDraft.submitDraft,
  })
  const currentConfirmRejected = isInteractionSubmitDraftRejected({ value: 'confirm' })
  const animalReorgConfirmDisabled = isInteractionSubmitDraftRejected({
    value: 'confirm',
    ...animalReorgSubmitDraft,
  })
  const interactionBarPendingChoice =
    interactionPresentationPlan.kind === 'exchange-center' ||
    interactionPresentationPlan.kind === 'moor-special-action'
      ? null
      : currentSelectionRejected && planPendingChoice
        ? {
            ...planPendingChoice,
            options: planPendingChoice.options.map((option) =>
              option.value === 'confirm' ? { ...option, disabled: true } : option),
          }
        : planPendingChoice
  const suppressPendingChoiceOptions = interactionPresentationPlan.kind === 'moor-special-action'
  const pendingNextPlayerIndex =
    interactionPresentationPlan.kind === 'confirm-next-player'
      ? interactionPresentationPlan.nextPlayerIndex
      : null
  const pendingPlayerSwitch =
    interactionPresentationPlan.kind === 'confirm-player-switch'
      ? {
          fromPlayerIndex: interactionPresentationPlan.fromPlayerIndex,
          toPlayerIndex: interactionPresentationPlan.toPlayerIndex,
        }
      : null
  const harvestPending = useMemo(
    () =>
      interactionPresentationPlan.kind === 'harvest-feed' && state
        ? {
            playerIndex: interactionPresentationPlan.playerIndex,
            playerName: getPlayerDisplayName(locale, state.players[interactionPresentationPlan.playerIndex]?.name, interactionPresentationPlan.playerIndex, state.players[interactionPresentationPlan.playerIndex]?.nameIsDefault),
            remaining: interactionPresentationPlan.remaining,
            foodUsed: interactionPresentationPlan.foodUsed,
          }
        : null,
    [interactionPresentationPlan, locale, state],
  )
  const heatingPending = useMemo(
    () =>
      interactionPresentationPlan.kind === 'heating' && state
        ? {
            playerName: getPlayerDisplayName(locale, state.players[interactionPresentationPlan.playerIndex]?.name, interactionPresentationPlan.playerIndex, state.players[interactionPresentationPlan.playerIndex]?.nameIsDefault),
            required: interactionPresentationPlan.required,
            maxFuelPayable: interactionPresentationPlan.maxFuelPayable,
            maxWoodConvertibleToFuel: interactionPresentationPlan.maxWoodConvertibleToFuel,
            isConfirmDisabled: (payload: { fuelUsed: number; woodToFuel: number }) =>
              isInteractionSubmitDraftRejected({
                value: 'confirm',
                heatingPayment: payload,
              }),
          }
        : null,
    [interactionPresentationPlan, isInteractionSubmitDraftRejected, locale, state],
  )
  const canTakeActionForBoard = useCallback((space: ActionSpace, _player: PlayerState) => {
    if (!state || !currentPlayer || !isInteractive) return false
    if (interaction.stateId === 'wait') {
      const option = placeFarmerChoiceBySpaceId.get(space.id)
      return !!option && !option.disabled
    }
    if (interaction.stateId !== 'idle') return false
    return actionAvailability[space.id] === true
  }, [state, currentPlayer, interaction.stateId, isInteractive, actionAvailability, placeFarmerChoiceBySpaceId])

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
    return Object.fromEntries(state.players.map((player, index) => [player.id, getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)]))
  }, [locale, state])
  const {
    timelineBuckets: actionLogTimelineBuckets,
    replaySummary,
    replayStepEntries,
    replayFeedback,
  } = useMemo(
    () => buildReplayActionLogPresentation({
      events: roomHistory.events,
      publicEventArchive: roomHistory.publicEventArchive,
      stateLog: roomHistory.log,
      currentRound: state?.round ?? 1,
      locale,
      playerNames,
      actionNames,
      replayFilter,
      selectedReplayKey,
    }),
    [
      actionNames,
      locale,
      playerNames,
      replayFilter,
      selectedReplayKey,
      roomHistory.events,
      roomHistory.log,
      roomHistory.publicEventArchive,
      state?.round,
    ],
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

  const {
    applySnapshotPublicEventCancellations,
    displayPublicEventNotifications,
    displayPublicEventResourceAnimations,
    displayPublicEventCardPassAnimations,
    highlightedActionIds,
    highlightedFarmTileKeys,
    highlightedFenceEdgeIds,
  } = usePublicEventCuePresentation({
    state,
    locale,
    replayFeedback,
    displayPlayerId: displayPlayer?.id ?? '',
  })

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
  const { baseActions, seasonActions } = useMemo(
    () => splitBoardActionSpaces(actionSpaces, roundActionOrder),
    [actionSpaces, roundActionOrder],
  )
  const takeSeasonAction = useCallback((spaceId: string) => {
    const space = seasonActions.find((candidate) => candidate.id === spaceId)
    if (space) takeAction(space)
  }, [seasonActions, takeAction])

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
      ? buildSelectableMinorIds(pendingChoiceOptions)
      : new Set<string>()
  const selectableOccupationIds =
    pendingChoiceOptions && isSelectingOccupation
      ? buildSelectableOccupationIds(pendingChoiceOptions)
      : new Set<string>()
  const selectableMajorIds =
    pendingChoiceOptions && isSelectingImprovementAny
      ? buildSelectableMajorIds(pendingChoiceOptions, availableMajorImprovements)
      : new Set<string>()

  const cardLabel = useCallback((id: string) => {
    const improvementName = t(locale, `improvements.${id}.name`)
    if (improvementName !== `improvements.${id}.name`) {
      return improvementName.replace(/\s*[（(].*$/, '')
    }
    return getCardMeta(id)?.name ?? id
  }, [locale])

  const exchangeDraft = useExchangeDraftPresentation({
    state,
    pendingChoice,
    interactionPresentationPlan,
    locale,
    cardLabel,
    getCardMeta,
  })
  const resetExchangeDraft = exchangeDraft.reset
  const isBakeExchange = exchangeDraft.bake.isActive
  const isAnytimeExchange = exchangeDraft.anytime.isActive
  const harvestFeedSelections = exchangeDraft.harvestFeed.selections
  const harvestFeedConfirmDisabled = isInteractionSubmitDraftRejected({
    value: 'confirm',
    feedSelections: harvestFeedSelections,
  })
  const bakeExchangeChoice = exchangeDraft.bake.choice
  const anytimeExchangeChoice = exchangeDraft.anytime.choice
  const confirmBakeExchange = useCallback(() => {
    if (!pendingChoice || !isBakeExchange || !bakeExchangeChoice) return
    resolveChoice(bakeExchangeChoice)
  }, [bakeExchangeChoice, isBakeExchange, pendingChoice, resolveChoice])
  const confirmAnytimeExchange = useCallback(() => {
    if (!pendingChoice || !isAnytimeExchange || !anytimeExchangeChoice) return
    resolveChoice(anytimeExchangeChoice)
  }, [anytimeExchangeChoice, isAnytimeExchange, pendingChoice, resolveChoice])
  const cancelAnytimeExchange = useCallback(() => {
    if (!pendingChoice || !isAnytimeExchange) return
    resolveChoice('cancel')
  }, [isAnytimeExchange, pendingChoice, resolveChoice])

  const handleSnapshot = useCallback((payload: GameSyncPayload, roomId?: string) => {
    if (roomId) setRoomInUrl(roomId)
    applySnapshot(payload)
    applySnapshotPublicEventCancellations(payload)
    syncAnimalReorgFromInteraction(payload.interaction, payload.state)
    if (payload.ok) {
      setSelectedSpecialAction(null)
      resetFarmSelectionDraft()
      resetExchangeDraft()
    }
  }, [applySnapshot, applySnapshotPublicEventCancellations, resetExchangeDraft, resetFarmSelectionDraft, syncAnimalReorgFromInteraction])

  const snapshotTransport = isWs ? wsTransport : transport
  useEffect(() => {
    if (!snapshotTransport) return
    return snapshotTransport.onSnapshot(handleSnapshot)
  }, [handleSnapshot, snapshotTransport])
  useEffect(() => {
    if (!isReady) return
    transport.getState().catch((e) => { console.error("fetchState failed:", e) })
  }, [transport, isReady])
  useEffect(() => {
    if (!wsTransport) return
    return wsTransport.onPersistenceStatus(setPersistencePaused)
  }, [wsTransport])
  const confirmHarvestFeed = useCallback(() => {
    if (!isInteractive) return
    if (interactionPresentationPlan.kind !== 'harvest-feed') return
    const submitCommand = buildInteractionSubmitCommand(interaction, {
      value: 'confirm',
      feedSelections: harvestFeedSelections,
    })
    if (runInteractionSubmitCommand(submitCommand)) return
    void transport
      .confirmFeed(interactionPresentationPlan.playerIndex, harvestFeedSelections)
      .catch((e) => console.error(e))
  }, [interaction, interactionPresentationPlan, transport, isInteractive, harvestFeedSelections, runInteractionSubmitCommand])
  const confirmHeating = useCallback((payload: { fuelUsed: number; woodToFuel: number }) => {
    if (!isInteractive) return
    if (interactionPresentationPlan.kind !== 'heating') return
    const submitCommand = buildInteractionSubmitCommand(interaction, {
      value: 'confirm',
      heatingPayment: payload,
    })
    if (runInteractionSubmitCommand(submitCommand)) return
    void transport
      .resolveChoice(interactionPresentationPlan.playerIndex, 'confirm', payload)
      .catch((e) => console.error(e))
  }, [interaction, interactionPresentationPlan, transport, isInteractive, runInteractionSubmitCommand])

  const fieldPositions = useMemo(() => new Set((displayPlayer?.fields ?? []).map((f) => positionKey({ row: f.row, col: f.col }))), [displayPlayer?.fields])
  const specialTerrainSelectableSet = useMemo(() => {
    if (!selectedSpecialAction || !state || !currentPlayer || !displayPlayer) return new Set<string>()
    if (!isMoorTerrainAction(selectedSpecialAction.actionId)) return new Set<string>()
    if (pendingMoorSpecialActionChoices.isActive) {
      if (!isInteractive || interaction.stateId !== 'wait') return new Set<string>()
      if (displayPlayer.id !== activePlayer?.id) return new Set<string>()
      return getPendingMoorSpecialActionTileKeys(
        pendingMoorSpecialActionChoices,
        selectedSpecialAction.cardId,
        selectedSpecialAction.actionId,
      )
    }
    if (!isInteractive || interaction.stateId !== 'idle') return new Set<string>()
    if (displayPlayer.id !== currentPlayer.id) return new Set<string>()
    const targetKind = selectedSpecialAction.actionId === 'cut-peat' ? 'moor' : 'forest'
    return new Set(
      (displayPlayer.farmTerrain ?? [])
        .filter((tile) => tile.kind === targetKind)
        .map((tile) => positionKey(tile)),
    )
  }, [activePlayer?.id, currentPlayer, displayPlayer, interaction.stateId, isInteractive, pendingMoorSpecialActionChoices, selectedSpecialAction, state])
  const farmBoardProjection = useMemo(
    () => buildFarmBoardProjection({
      displayPlayer,
      interaction,
      farmInteraction,
      selectionInteraction,
      players: state?.players,
      state,
      pastureCapacities,
      animalReorg,
      pendingAnimalReorg,
      ...farmSelectionDraft.projectionDraft,
      extraPositionSelectableSet: specialTerrainSelectableSet,
    }),
    [
      displayPlayer,
      interaction,
      farmInteraction,
      selectionInteraction,
      state,
      pastureCapacities,
      animalReorg,
      pendingAnimalReorg,
      farmSelectionDraft.projectionDraft,
      specialTerrainSelectableSet,
    ],
  )
  const actionBoardProjection = useMemo(
    () => buildActionBoardProjection({
      locale,
      players: state?.players ?? [],
      baseActions,
      roundSlots,
      currentRound: state?.round ?? 1,
    }),
    [baseActions, locale, roundSlots, state?.players, state?.round],
  )
  const { reorgRemaining } = farmBoardProjection

  const confirmAnimalReorg = useCallback(() => {
    confirmAnimalReorgDraft(reorgRemaining, resolveChoice)
  }, [confirmAnimalReorgDraft, reorgRemaining, resolveChoice])
  const wrappedTogglePositionSelection = (tile: FarmTilePosition) => {
    if (selectedSpecialAction && state && isInteractive && interaction.stateId === 'wait' && pendingMoorSpecialActionChoices.isActive) {
      const option = getPendingMoorSpecialActionTileChoice(
        pendingMoorSpecialActionChoices,
        selectedSpecialAction.cardId,
        selectedSpecialAction.actionId,
        tile,
      )
      if (!option) return
      void transport.resolveChoice(interaction.playerIndex, option.value).catch((e) => {
        console.error('resolveChoice error', e)
      })
      return
    }
    if (selectedSpecialAction && state && isInteractive && interaction.stateId === 'idle') {
      void transport.takeSpecialAction(
        state.currentPlayerIndex,
        selectedSpecialAction.cardId,
        selectedSpecialAction.actionId,
        { tile },
      ).catch((e) => {
        console.error('takeSpecialAction error', e)
      })
      return
    }
    farmSelectionDraft.controls.togglePositionSelection(tile)
  }
  const setViewPlayerIdSafe = useCallback((value: string) => {
    setViewPlayerId(value)
  }, [])

  const futureCardResources = useMemo(() => {
    if (!state) return {}
    const rec: Record<string, { playerId: string; name: string; color: PlayerState['color']; resources: Partial<Resource> }[]> = {}
    state.futureMeeples.forEach((fm) => {
      if (fm.round > state.round) {
        const key = fm.actionId ?? fm.cardId
        if (!rec[key]) rec[key] = []
        const player = state.players.find((p) => p.id === fm.playerId)
        rec[key].push({ playerId: fm.playerId, name: player ? getPlayerDisplayName(locale, player.name, state.players.indexOf(player), player.nameIsDefault) : '', color: player?.color ?? 'red', resources: fm.resources })
      }
    })
    return rec
  }, [locale, state])

  const scoreRows = useMemo(
    () => buildCompactScoreRows(state, scores, selfPlayer?.id ?? null)
      .map((row) => ({ ...row, name: playerNames[row.id] })),
    [state, scores, selfPlayer?.id, playerNames],
  )

  const resourceKeys = devResourceKeysForState(state)

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
    // Load back the full state, not this seat's projection: the projection has
    // masked hands and no Game Seed, and the server would fill both in afresh.
    const clone = JSON.parse(JSON.stringify(
      (await transport.getState({ unredacted: true })).state,
    )) as import('../../shared/contract/types').GameState
    const cp = clone.players.find((p) => p.id === devPlayerId)
    if (!cp) return
    cp.resources.wood = Math.max(0, 6)
    await transport.loadGame(clone)
    await transport.devCreatePasture(playerIndex)
  }, [state, isInteractive, devPlayerId, transport])

  const saveDevState = useCallback(async () => {
    if (!state) return
    try {
      const snapshot = (await transport.getState({ unredacted: true })).state
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `open-agricola-round-${snapshot.round}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('saveDevState error', e)
    }
  }, [state, transport])

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

  if (isWs && wsStatus.phase !== 'ready') {
    const wsProgressPhase =
      resolveGameLoadPhase({ wsStatus, hasGameView: false }) ??
      (wsStatus.phase === 'idle' ? 'wsConnecting' : null)

    if (wsProgressPhase) {
      const { percent, labelKey } = getGameLoadProgress(wsProgressPhase)
      return (
        <GameLoadScreen percent={percent} label={t(locale, labelKey)}>
          {persistencePaused ? (
            <div className="ws-status-text" role="alert">
              {t(locale, 'ui.roomPersistencePaused')}
            </div>
          ) : null}
        </GameLoadScreen>
      )
    }

    const isNetworkError = wsStatus.phase === 'error' &&
      (wsStatus.message === 'WebSocket connection failed' || wsStatus.message === 'no WebSocket instance')
    const statusText = wsStatus.phase === 'reconnecting'
      ? t(locale, 'platform.roomReconnecting')
      : wsStatus.phase === 'waiting'
      ? t(locale, 'platform.waitingForPlayers', { roomId: wsStatus.roomId, current: String(wsStatus.players.length), max: String(wsStatus.maxPlayers) })
      : wsStatus.phase === 'error'
        ? wsStatus.message === 'roomDissolved'
          ? t(locale, 'platform.roomDissolved')
          : wsStatus.message === 'roomTerminatedCardTakedown'
            ? t(locale, 'platform.roomTerminatedCardTakedown')
            : isNetworkError
            ? t(locale, 'platform.roomNetworkError')
            : `Error: ${wsStatus.message}`
        : ''

    const inviteUrl = wsStatus.phase === 'waiting'
      ? `${window.location.origin}${window.location.pathname}?page=game&transport=ws&room=${wsStatus.roomId}`
      : null

    const handleCopyInvite = async () => {
      if (!inviteUrl) return
      setInviteCopyStatus(null)
      try {
        if (!navigator.clipboard) throw new Error('clipboard unavailable')
        await navigator.clipboard.writeText(inviteUrl)
        setInviteCopyStatus('success')
      } catch {
        setInviteCopyStatus('error')
      }
    }

    const handleDissolve = () => {
      if (!wsTransport) return
      if (!window.confirm(t(locale, 'platform.dissolveConfirm'))) return
      wsTransport.sendRoomCommand('dissolveRoom')
      setPage('lobby')
    }

    return (
      <div className="ws-status-screen">
        <div className="ws-status-card">
          {!isEmbedded ? (
            <BrandMark
              title="Open Agricola"
              titleAs="h2"
              className="brand-mark-centered ws-status-brand"
              titleClassName="ws-status-title"
              homeLinkLabel={t(locale, 'platform.backToLobbyPlain')}
            />
          ) : null}
          <div className="ws-status-text" role={wsStatus.phase === 'error' ? 'alert' : undefined}>
            {statusText}
          </div>
          {persistencePaused ? (
            <div className="ws-status-text" role="alert">
              {t(locale, 'ui.roomPersistencePaused')}
            </div>
          ) : null}

          {wsStatus.phase === 'waiting' && inviteUrl && (
            <div className="ws-invite-panel">
              <div className="ws-invite-label">{t(locale, 'platform.inviteLabel')}</div>
              <div className="ws-invite-url-row">
                <code className="ws-invite-url">{inviteUrl}</code>
                <button
                  type="button"
                  className="btn-primary ws-btn-sm"
                  onClick={() => { void handleCopyInvite() }}
                >
                  {t(locale, 'platform.copy')}
                </button>
              </div>
              {inviteCopyStatus && (
                <div
                  className={`ws-invite-feedback is-${inviteCopyStatus}`}
                  role={inviteCopyStatus === 'error' ? 'alert' : 'status'}
                  aria-live={inviteCopyStatus === 'error' ? 'assertive' : 'polite'}
                >
                  {t(locale, inviteCopyStatus === 'success'
                    ? 'platform.inviteCopySuccess'
                    : 'platform.inviteCopyFailure')}
                </div>
              )}
              <div className="ws-invite-roomid">{t(locale, 'platform.roomIdLabel')}<strong>{wsStatus.roomId}</strong></div>
              <div className="ws-invite-players">
                {wsStatus.players.map(p => (
                  <div key={p.playerIndex} className="ws-invite-player">
                    {t(locale, 'platform.playerLabel', { index: String(p.playerIndex + 1), name: getPlayerDisplayName(locale, p.name, p.playerIndex) })}
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
              {wsStatus.code === 'context_changed' ? (
                <button type="button" className="btn-primary" onClick={() => setPage('lobby')}>
                  {t(locale, 'platform.backToLobbyPlain')}
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                  {t(locale, 'platform.retry')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!hasGameView) {
    const fetchPhase =
      resolveGameLoadPhase({ wsStatus: isWs ? wsStatus : undefined, hasGameView: false }) ?? 'fetchingState'
    const { percent, labelKey } = getGameLoadProgress(fetchPhase)
    return <GameLoadScreen percent={percent} label={t(locale, labelKey)} />
  }

  const notificationStack = recoveryNotice || persistencePaused || privateEventNotifications.length > 0 || displayPublicEventNotifications.length > 0 ? (
    <div className="event-notifications" role="status" aria-live="polite">
      {recoveryNotice ? (
        <div role="alert" className="event-notification">
          {t(locale, 'platform.roomInputChanged')}
          <button type="button" onClick={clearRecoveryNotice}>{t(locale, 'ui.close')}</button>
        </div>
      ) : null}
      {persistencePaused ? (
        <div className="public-event-notification" data-kind="future" role="alert">
          {t(locale, 'ui.roomPersistencePaused')}
        </div>
      ) : null}
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
    // Draft does not advance currentPlayerIndex, so hotseat walks the seats in
    // order and covers the screen before handing over to the next one.
    const hotseatSeatId = isHotseat ? nextHotseatDraftSeatId(state.draft) : null
    const meId = (isWs && localPlayerId && !isHotseat)
      ? localPlayerId
      : (hotseatSeatId ?? selfPlayer?.id ?? state.players[0]?.id ?? '')
    if (hotseatSeatId && hotseatSeatConfirmed !== hotseatSeatId) {
      return (
        <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
          <HotseatHandoff
            playerName={playerNames[hotseatSeatId] ?? hotseatSeatId}
            locale={locale}
            onConfirm={() => setHotseatSeatConfirmed(hotseatSeatId)}
          />
        </div>
      )
    }
    return (
      <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
        {notificationStack}
        {bugReportBar}
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

  if (state.phase === 'parent-selection' && state.parentSelection) {
    const hotseatSeatId = isHotseat ? nextHotseatParentSeatId(state) : null
    const meId = (isWs && localPlayerId && !isHotseat)
      ? localPlayerId
      : (hotseatSeatId ?? selfPlayer?.id ?? state.players[0]?.id ?? '')
    const playerIndex = Math.max(0, state.players.findIndex((player) => player.id === meId))
    if (hotseatSeatId && hotseatSeatConfirmed !== hotseatSeatId) {
      return (
        <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
          <HotseatHandoff
            playerName={playerNames[hotseatSeatId] ?? hotseatSeatId}
            locale={locale}
            onConfirm={() => setHotseatSeatConfirmed(hotseatSeatId)}
          />
        </div>
      )
    }
    return (
      <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
        {notificationStack}
        {bugReportBar}
        <ParentSelectionOverlay
          state={state}
          meId={meId}
          locale={locale}
          onSubmit={async (selection) => {
            try {
              await transport.parentSubmit(playerIndex, selection)
            } catch (e) {
              console.error('parentSubmit error', e)
            }
          }}
        />
      </div>
    )
  }

  // Ordinary turns hand the device over too: once the board would start showing
  // a different seat's cards, cover it until that player says they are holding
  // the device. Draft / parent selection are covered by their own branches above.
  if (isHotseat && displayPlayer && hotseatSeatConfirmed !== displayPlayer.id) {
    return (
      <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
        <HotseatHandoff
          playerName={playerNames[displayPlayer.id] ?? displayPlayer.id}
          locale={locale}
          onConfirm={() => setHotseatSeatConfirmed(displayPlayer.id)}
        />
      </div>
    )
  }

  const farmBoardView = {
    ...farmBoardProjection,
    ...farmSelectionDraft.farmBoardDraft,
    locale,
    activePlayerId: activePlayer?.id,
    currentStartPlayerId: state.players.find((p) => p.startPlayer)?.id ?? '',
    nextStartPlayerId: state.players.find((p) => p.startPlayer)?.id ?? '',
    fieldPositions,
    isReorgActive,
    hasReorgOverflow,
    animalReorg,
    isSelectingMinor,
    isSelectingOccupation,
    isSelectingImprovementAny,
    selectableMinorIds,
    selectableOccupationIds,
    cardAvailability,
    futureCardResources,
    devMode,
    isInteractive,
    occupationHandSelection: occupationHandInteraction ?? undefined,
    highlightedHandCardId,
    highlightedFarmTileKeys,
    highlightedFenceEdgeIds,
  }
  const farmBoardActions = {
    toggleRoomTile: farmSelectionDraft.controls.toggleRoomTile,
    toggleStableTile: farmSelectionDraft.controls.toggleStableTile,
    toggleFarmHand: farmSelectionDraft.controls.toggleFarmHand,
    togglePlowTile: farmSelectionDraft.controls.togglePlowTile,
    updateSowSelection: farmSelectionDraft.controls.updateSowSelection,
    togglePositionSelection: wrappedTogglePositionSelection,
    toggleFenceEdge: farmSelectionDraft.controls.toggleFenceEdge,
    adjustReorgAnimal,
    confirmAnimalReorg,
    cancelAnimalDiscardPrompt,
    setViewPlayerId: setViewPlayerIdSafe,
    resolveChoice,
    onConfirmOccupationHandSelection: (ids: string[]) => {
      if (!isInteractive) return
      const submitCommand = buildInteractionSubmitCommand(interaction, {
        value: 'confirm',
        occupationCardIds: ids,
      })
      runInteractionSubmitCommand(submitCommand)
    },
    isOccupationHandSelectionRejected: (ids: string[]) => isInteractionSubmitDraftRejected({
      value: 'confirm',
      occupationCardIds: ids,
    }),
  }
  const interactionBarResourceQuantitySelect =
    interactionPresentationPlan.kind === 'resource-quantity-select'
      ? {
          availableByResource: interactionPresentationPlan.availableByResource,
          promptKey: interactionPresentationPlan.promptKey,
          requireAtLeastOne: interactionPresentationPlan.requireAtLeastOne,
          isConfirmDisabled: (counts: Partial<Record<keyof Resource, number>>) =>
            isInteractionSubmitDraftRejected({
              value: 'confirm',
              resourceCounts: counts,
            }),
          onConfirm: (counts: Partial<Record<keyof Resource, number>>) => {
            if (!isInteractive) return
            const submitCommand = buildInteractionSubmitCommand(interaction, {
              value: 'confirm',
              resourceCounts: counts,
            })
            runInteractionSubmitCommand(submitCommand)
          },
          onCancel: () => {
            if (!isInteractive) return
            const submitCommand = buildInteractionSubmitCommand(interaction, { value: 'cancel' })
            runInteractionSubmitCommand(submitCommand)
          },
        }
      : null
  const interactionBarResourceBatchExchangeSelect =
    interactionPresentationPlan.kind === 'resource-batch-exchange-select'
      ? {
          discardAvailableByResource: interactionPresentationPlan.discardAvailableByResource,
          receiveResources: interactionPresentationPlan.receiveResources,
          maxTotal: interactionPresentationPlan.maxTotal,
          promptKey: interactionPresentationPlan.promptKey,
          isConfirmDisabled: (payload: {
            discard: Partial<Record<keyof Resource, number>>
            receive: Partial<Record<keyof Resource, number>>
          }) => isInteractionSubmitDraftRejected({
            value: 'confirm',
            resourceBatchExchange: payload,
          }),
          onConfirm: (payload: {
            discard: Partial<Record<keyof Resource, number>>
            receive: Partial<Record<keyof Resource, number>>
          }) => {
            if (!isInteractive) return
            const submitCommand = buildInteractionSubmitCommand(interaction, {
              value: 'confirm',
              resourceBatchExchange: payload,
            })
            runInteractionSubmitCommand(submitCommand)
          },
          onCancel: () => {
            if (!isInteractive) return
            const submitCommand = buildInteractionSubmitCommand(interaction, { value: 'cancel' })
            runInteractionSubmitCommand(submitCommand)
          },
        }
      : null
  const interactionBarModel = buildInteractionBarModel({
    locale,
    playerNames: state.players.map((p) => playerNames[p.id]),
    isInteractive,
    pending: {
      animalReorg: pendingAnimalReorg,
      choice: interactionBarPendingChoice,
      engineBlocked: pendingEngineBlocked,
      nextPlayerIndex: pendingNextPlayerIndex,
      playerSwitch: pendingPlayerSwitch,
      harvestFeedPlayerName: harvestPending?.playerName ?? null,
      harvestFeedConfirmDisabled,
      nextPlayerConfirmDisabled: currentConfirmRejected,
      playerSwitchConfirmDisabled: currentConfirmRejected,
      heating: heatingPending,
      resourceQuantitySelect: interactionBarResourceQuantitySelect,
      resourceBatchExchangeSelect: interactionBarResourceBatchExchangeSelect,
      suppressChoiceOptions: suppressPendingChoiceOptions,
    },
    farm: {
      pendingRoomTilesLength: farmSelectionDraft.interactionBarDraft.pendingRoomTilesLength,
      maxRoomSelections: farmSelectionDraft.interactionBarDraft.maxRoomSelections,
      pendingFenceEdgesLength: farmSelectionDraft.interactionBarDraft.pendingFenceEdgesLength,
      pendingStableTilesLength: farmSelectionDraft.interactionBarDraft.pendingStableTilesLength,
      maxStableSelections: farmSelectionDraft.interactionBarDraft.maxStableSelections,
      pendingFarmHandSelected: farmSelectionDraft.interactionBarDraft.pendingFarmHandSelected,
      pendingSowSelectionsLength: farmSelectionDraft.interactionBarDraft.pendingSowSelectionsLength,
      pendingPositionSelectionsLength: farmSelectionDraft.interactionBarDraft.pendingPositionSelectionsLength,
      maxPositionSelections: farmSelectionDraft.interactionBarDraft.maxPositionSelections,
      hasPendingPlowSelection: farmSelectionDraft.interactionBarDraft.hasPendingPlowSelection,
      errors: {
        fence: farmSelectionDraft.interactionBarDraft.fenceErrorText ?? '',
        room: farmSelectionDraft.interactionBarDraft.roomErrorText ?? '',
        stable: farmSelectionDraft.interactionBarDraft.stableErrorText ?? '',
        plow: farmSelectionDraft.interactionBarDraft.plowErrorText ?? '',
        sow: farmSelectionDraft.interactionBarDraft.sowErrorText ?? '',
      },
      selecting: {
        fences: isSelectingFences,
        rooms: isSelectingRooms,
        stables: isSelectingStables,
        plow: isSelectingPlow,
        sow: isSelectingSow,
      },
      fence: {
        canBuildPalisades: !!currentPlayer && playerCanBuildPalisades(currentPlayer),
        placementMode: farmSelectionDraft.interactionBarDraft.fencePlacementMode,
        setPlacementMode: farmSelectionDraft.controls.setFencePlacementMode,
        borrowedSources: farmSelectionDraft.borrowedFenceSources,
      },
    },
    animalReorg: {
      state: animalReorg,
      remaining: reorgRemaining,
      hasOverflow: hasReorgOverflow,
      confirmDisabled: animalReorgConfirmDisabled,
    },
    controls: {
      canUndoStep,
      canUndoAction,
      historyLength,
      hasActionStartSnapshot,
      anytimeActions: pendingEngineBlocked ? [] : interaction.anytimeActions,
    },
  })
  const interactionBarActions = buildInteractionBarActions({
    resolveChoice,
    confirmNextPlayer,
    confirmPlayerSwitch,
    confirmHarvestFeed,
    confirmHeating,
    undoStep,
    undoAction,
    showScoring,
    takeAnytimeAction,
    confirmAnimalReorg,
    cancelAnimalDiscardPrompt,
  })
  const majorImprovementsPresentation = (
    <MajorImprovements
      locale={locale}
      availableMajorImprovements={state.availableMajorImprovements}
      majorImprovementSupply={state.majorImprovementSupply}
      isSelectingMajor={isSelectingImprovementAny}
      selectableMajorIds={selectableMajorIds}
      cardAvailability={cardAvailability}
      resolveChoice={resolveChoice}
      futureCardResources={futureCardResources}
      isInteractive={isInteractive}
      devMode={devMode}
    />
  )
  const actionBoardOverview = (
    <section className="board-panel board-action">
      <ActionBoard locale={locale} baseActions={baseActions} roundSlots={roundSlots} currentPlayer={currentPlayer} players={state.players} futureMeeples={state.futureMeeples} canTakeAction={canTakeActionForBoard} takeAction={takeAction} currentRound={state.round} devMode={devMode} highlightedActionIds={highlightedActionIds} actionSpaceSelectionActive={placeFarmerChoiceBySpaceId.size > 0} actionSpaceReservations={actionBoardProjection.actionSpaceReservations} actionSpaceAttachments={actionBoardProjection.actionSpaceAttachments} leftActionNames={actionBoardProjection.leftActionNames} enablePrecisionMode={isMobile} />
    </section>
  )
  const expansionActionBoards = (
    <>
      {state.enableThroughTheSeasons && state.throughTheSeasons ? (
        <section className="board-panel board-seasons">
          <SeasonsBoard
            locale={locale}
            throughTheSeasons={state.throughTheSeasons}
            seasonActions={seasonActions}
            players={state.players}
            canTakeAction={(space) => canTakeActionForBoard(space, currentPlayer)}
            takeAction={takeSeasonAction}
          />
        </section>
      ) : null}
      {state.enableFarmersOfTheMoor && state.farmersOfTheMoor ? (
        <section className="board-panel board-special-actions">
          <SpecialActionsPanel
            locale={locale}
            playerCount={state.players.length}
            cards={state.farmersOfTheMoor.specialActionCards}
            currentPlayerId={currentPlayer.id}
            availability={currentPlayer.moorSpecialActionAvailability}
            canTakeSpecialAction={canTakeSpecialAction}
            selected={selectedSpecialAction}
            onTakeAction={takeSpecialAction}
          />
        </section>
      ) : null}
    </>
  )

  return (
    <div className={`app${isEmbedded ? ' app--embedded' : ''}`}>
      {notificationStack}
      <PublicEventResourceAnimations
        animations={displayPublicEventResourceAnimations}
        displayPlayerId={displayPlayer.id}
        locale={locale}
      />
      <PublicEventCardPassAnimation
        animations={displayPublicEventCardPassAnimations}
      />
      {selfPlayer ? (
        <OrdinaryCardDrawOverlay
          state={state}
          playerId={selfPlayer.id}
          locale={locale}
          onKeep={async (choiceId, keepCardId) => {
            const playerIndex = state.players.findIndex((player) => player.id === selfPlayer.id)
            if (playerIndex < 0) return
            try {
              await transport.ordinaryDrawKeep(playerIndex, choiceId, keepCardId)
            } catch (e) {
              console.error('ordinaryDrawKeep error', e)
            }
          }}
        />
      ) : null}
      <ExchangeOverlayPresentation
        locale={locale}
        isInteractive={isInteractive}
        pendingChoice={pendingChoice}
        harvestPending={harvestPending}
        harvestFeedConfirmDisabled={harvestFeedConfirmDisabled}
        draft={exchangeDraft}
        cardLabel={cardLabel}
        actions={{
          confirmBakeExchange,
          confirmAnytimeExchange,
          cancelAnytimeExchange,
          confirmHarvestFeed,
        }}
      />
      {shouldShowScoringPad ? <ScoringPad locale={locale} scores={scores ?? []} players={state.players} onClose={closeScoring} showDraftHistory={state.gameOver} /> : null}
      {shouldShowDevPanel({ devMode, hasGameView }) ? (
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
          myPlayerName={selfPlayer ? playerNames[selfPlayer.id] : null}
          isMyTurn={isMyTurn}
          embedded={isEmbedded}
        />
      </div>

      {majorImprovementsPresentation}

      <div
        className="game-layout"
        style={{ '--game-header-height': `${headerHeight}px` } as CSSProperties}
      >
        <div className="game-layout__left">
          {actionBoardOverview}
          {expansionActionBoards}
        </div>
        <div className="game-layout__center">
          <StageBar currentRound={state.round ?? 1} locale={locale} />
          <PlayerTabs
            players={state.players.map((p, i) => ({
              id: p.id,
              name: playerNames[p.id],
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
            <PlayerFarmPanel
              state={state}
              viewedPlayerId={displayPlayer.id}
              view={farmBoardView}
              actions={farmBoardActions}
              inlineCardStats={isMobile}
            />
          </section>
        </div>
        <div className="game-layout__right">
          {isMobile ? (
            <>
              <Section collapsible defaultCollapsed locale={locale} title={t(locale, 'ui.scoringPadTitle')} variant="parchment">
                <ScorePanel locale={locale} rows={scoreRows} />
              </Section>
              <Section collapsible defaultCollapsed locale={locale} title={t(locale, 'ui.actionLog')} variant="parchment">
                <ActionLog
                  locale={locale}
                  log={roomHistory.log}
                  history={historyWindow ? roomHistory : undefined}
                  limit={historyWindow ? Number.MAX_SAFE_INTEGER : undefined}
                  playerNames={playerNames}
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
              <ScorePanel locale={locale} rows={scoreRows} />
              <ActionLog
                locale={locale}
                log={roomHistory.log}
                  history={historyWindow ? roomHistory : undefined}
                  limit={historyWindow ? Number.MAX_SAFE_INTEGER : undefined}
                playerNames={playerNames}
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

      {bugReportBar}
      <InteractionBar model={interactionBarModel} actions={interactionBarActions} />
    </div>
  )
}
