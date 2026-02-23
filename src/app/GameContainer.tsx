import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActionChoiceOption,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../game/types'
import { t } from '../i18n'
import type { AnimalReorgState, HistorySnapshot } from '../types/ui'
import { FARM_COLS, FARM_ROWS, getAllTilePositions, positionKey } from '../game/farm'
import { getLooseStableKeys, getPastureCapacity } from '../actions/effects/animals'
import { getBuildRoomCost } from '../actions/effects/house'
import { stableWoodCost } from '../actions/effects/fencing'
import { applyMajorEffectsToAllPlayers } from '../actions/cards/major'
import { useActionEngine } from '../hooks/useActionEngine'
import { useGameState } from '../hooks/useGameState'
import { useFarmSelection } from '../hooks/useFarmSelection'
import {
  baseActionOrder,
  cloneState,
  createInitialState,
  createRoundOpenById,
  createRoundSnapshot,
  emptyResources,
  harvestRounds,
  isActionForPlayerCount,
  normalizeState,
  resourceKeyList,
} from '../logic/state'
import { computeFencedRegions } from '../logic/farm'
import { formatResources } from '../logic/format'
import type { HarvestSummary } from '../logic/round'
import {
  addResource,
  persistGame,
  validateFence,
  validatePlow,
  validateRoom,
  validateStable,
  validateSow,
} from '../services/api'
import { ActionBoard } from '../components/board/ActionBoard'
import { FarmBoard } from '../components/board/FarmBoard'
import { LogPanel } from '../components/board/LogPanel'
import { MajorImprovements } from '../components/board/MajorImprovements'
import { ScoringPad } from '../components/board/ScoringPad'
import { GameControls } from '../components/controls/GameControls'
import { GameHeader } from '../components/header/GameHeader'
import { InteractionBar } from '../components/interaction/InteractionBar'
import { AnytimeBar } from '../components/interaction/AnytimeBar'
import { DevPanel } from '../components/dev/DevPanel'
import { ResourceLine } from '../components/common/ResourceLine'
import { computeScores } from '../logic/scoring'
import { majorImprovementIds } from '../game/major-improvements'
import { minorImprovementIds } from '../game/minor-improvements'
import { occupationIds } from '../game/occupations'
import { runEngineStepsCore } from './hooks/use-engine-flow'
import {
  applyAnimalReorgToPlayer,
  buildPostReorgPlan,
  buildReorgEngineProgressPlan,
} from './hooks/use-animal-reorg-flow'
import {
  applyBreedPhase as applyBreedPhaseCore,
  buildHarvestFeedOptions as buildHarvestFeedOptionsCore,
  buildHarvestLogEntries as buildHarvestLogEntriesCore,
  confirmHarvestFeedCore,
  findPendingAnimalPlayerIndex,
  type HarvestContext,
  startHarvestCore,
} from './hooks/use-harvest-flow'
import {
  canPerformRoundEnd,
  finalizeRoundCore,
  nextPlayerIndex,
  prepareRoundEndCore,
} from './hooks/use-round-flow'

export const GameContainer = () => {
  const [showScoringPad, setShowScoringPad] = useState(false)
  const [devCardId, setDevCardId] = useState('')
  const [resetSeedInput, setResetSeedInput] = useState('')
  const [bakeExchangeCounts, setBakeExchangeCounts] = useState<
    Record<string, number>
  >({})
  const [harvestContext, setHarvestContext] = useState<HarvestContext | null>(
    null,
  )
  const [harvestFeedCounts, setHarvestFeedCounts] = useState<
    Record<string, number>
  >({})
  const [pendingHarvestFinalizeState, setPendingHarvestFinalizeState] =
    useState<GameState | null>(null)
  const hasPendingHarvestFinalizeState = pendingHarvestFinalizeState !== null
  void hasPendingHarvestFinalizeState
  const {
    state,
    history,
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
    updateState,
    setHistory,
  } = useGameState()
  const {
    pendingFenceEdges,
    setPendingFenceEdges,
    fenceError,
    setFenceError,
    pendingRoomTiles,
    setPendingRoomTiles,
    roomError,
    setRoomError,
    pendingStableTiles,
    setPendingStableTiles,
    stableError,
    setStableError,
    pendingPlowTile,
    setPendingPlowTile,
    plowError,
    setPlowError,
    pendingSowSelections,
    setPendingSowSelections,
    sowError,
    setSowError,
    toggleFenceEdge,
    toggleRoomTile: toggleRoomTileInternal,
    toggleStableTile: toggleStableTileInternal,
    togglePlowTile: togglePlowTileInternal,
    updateSowSelection: updateSowSelectionInternal,
  } = useFarmSelection()
  const { engineRef, createEngine, canTakeAction } = useActionEngine()

  const createHistorySnapshot = (snapshotState: GameState): HistorySnapshot => ({
    state: cloneState(snapshotState),
    pendingNextPlayerIndex,
    pendingChoice: pendingChoice
      ? {
          promptKey: pendingChoice.promptKey,
          options: pendingChoice.options.map((option) => ({ ...option })),
          playerIndex: pendingChoice.playerIndex,
          spaceId: pendingChoice.spaceId,
          fenceExtraWood: pendingChoice.fenceExtraWood,
        }
      : null,
    pendingAnimalReorg: pendingAnimalReorg ? { ...pendingAnimalReorg } : null,
    animalReorg: animalReorg
      ? {
          zones: animalReorg.zones.map((zone) => ({ ...zone })),
          confirmDiscard: animalReorg.confirmDiscard,
        }
      : null,
    actionStartSnapshot: actionStartSnapshot
      ? cloneState(actionStartSnapshot)
      : null,
    pendingFenceEdges: [...pendingFenceEdges],
    fenceError: fenceError
      ? {
          code: fenceError.code,
          edges: [...fenceError.edges],
          newEdges: [...fenceError.newEdges],
        }
      : null,
    pendingRoomTiles: pendingRoomTiles.map((tile) => ({ ...tile })),
    roomError,
    pendingStableTiles: pendingStableTiles.map((tile) => ({ ...tile })),
    stableError,
    pendingPlowTile: pendingPlowTile ? { ...pendingPlowTile } : null,
    plowError,
    pendingSowSelections: { ...pendingSowSelections },
    sowError,
    engineSnapshot: engineRef.current ? engineRef.current.snapshot() : null,
    engineActionId:
      pendingChoice?.spaceId ?? pendingAnimalReorg?.spaceId ?? null,
  })

  const createBaselineSnapshot = (
    snapshotState: GameState,
  ): HistorySnapshot => ({
    state: cloneState(snapshotState),
    pendingNextPlayerIndex: null,
    pendingChoice: null,
    pendingAnimalReorg: null,
    animalReorg: null,
    actionStartSnapshot: null,
    pendingFenceEdges: [],
    fenceError: null,
    pendingRoomTiles: [],
    roomError: null,
    pendingStableTiles: [],
    stableError: null,
    pendingPlowTile: null,
    plowError: null,
    pendingSowSelections: {},
    sowError: null,
    engineSnapshot: null,
    engineActionId: null,
  })

  const pushHistorySnapshot = (snapshotState: GameState) => {
    const snapshot = createHistorySnapshot(snapshotState)
    setHistory((prev) => [...prev, snapshot])
  }

  const restoreHistorySnapshot = (snapshot: HistorySnapshot) => {
    setPendingNextPlayerIndex(snapshot.pendingNextPlayerIndex)
    setPendingChoice(snapshot.pendingChoice)
    setPendingAnimalReorg(snapshot.pendingAnimalReorg)
    setAnimalReorg(snapshot.animalReorg)
    setActionStartSnapshot(snapshot.actionStartSnapshot)
    setPendingFenceEdges(snapshot.pendingFenceEdges)
    setFenceError(snapshot.fenceError)
    setPendingRoomTiles(snapshot.pendingRoomTiles)
    setRoomError(snapshot.roomError)
    setPendingStableTiles(snapshot.pendingStableTiles)
    setStableError(snapshot.stableError)
    setPendingPlowTile(snapshot.pendingPlowTile)
    setPlowError(snapshot.plowError)
    setPendingSowSelections(snapshot.pendingSowSelections)
    setSowError(snapshot.sowError)
    if (snapshot.engineSnapshot && snapshot.engineActionId) {
      const restored = createEngine(snapshot.engineActionId)
      restored.restore(snapshot.engineSnapshot)
      engineRef.current = restored
    } else {
      engineRef.current = null
    }
    updateState(snapshot.state)
    void persistGame(snapshot.state)
  }

  const createAnimalReorgState = (player: PlayerState): AnimalReorgState => {
    const stableKeys = getLooseStableKeys(player)
    return {
      zones: [
        ...player.pastures.map((pasture) => ({
          id: pasture.id,
          zoneType: 'pasture' as const,
          animalType: pasture.animalType,
          animalCount: pasture.animalCount,
        })),
        {
          id: 'house',
          zoneType: 'house' as const,
          animalType: player.houseAnimalType ?? null,
          animalCount: player.houseAnimalCount ?? 0,
        },
        ...stableKeys.map((key) => ({
          id: `stable:${key}`,
          zoneType: 'stable' as const,
          animalType: player.stableAnimals?.[key] ?? null,
          animalCount: player.stableAnimals?.[key] ? 1 : 0,
        })),
      ],
      confirmDiscard: false,
    }
  }

  const getAssignedAnimalCount = (player: PlayerState) => {
    const pastureCount = player.pastures.reduce(
      (sum, pasture) => sum + pasture.animalCount,
      0,
    )
    const houseCount =
      player.houseAnimalType && player.houseAnimalCount > 0
        ? player.houseAnimalCount
        : 0
    const stableCount = Object.values(player.stableAnimals ?? {}).filter(Boolean).length
    return pastureCount + houseCount + stableCount
  }

  const getTotalAnimalCount = (player: PlayerState) =>
    player.resources.sheep + player.resources.boar + player.resources.cattle

  const hasPendingAnimals = (player: PlayerState) =>
    getTotalAnimalCount(player) > getAssignedAnimalCount(player)

  const currentPlayer = state.players[state.currentPlayerIndex]
  const viewedPlayer =
    state.players.find((player) => player.id === viewPlayerId) ?? currentPlayer
  const displayPlayer = viewPlayerId ? viewedPlayer : currentPlayer
  const playedCards = displayPlayer.playedCards ?? [
    ...displayPlayer.improvements.map((id) => `major:${id}`),
    ...displayPlayer.minorPlayed.map((id) => `minor:${id}`),
    ...displayPlayer.occupationPlayed.map((id) => `occupation:${id}`),
  ]
  const isSelectingImprovementAny =
    pendingChoice?.promptKey === 'ui.interactionChooseImprovement' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingMinor =
    ((pendingChoice?.spaceId === 'meeting-place' &&
      pendingChoice.promptKey === 'ui.interactionChooseMinorImprovement') ||
      isSelectingImprovementAny) &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingOccupation =
    (pendingChoice?.spaceId === 'lessons' ||
      pendingChoice?.spaceId === 'lessons-4') &&
    pendingChoice.promptKey === 'ui.interactionChooseOccupation' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingFences =
    pendingChoice?.promptKey === 'ui.interactionFenceSelect' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingStables =
    pendingChoice?.promptKey === 'ui.interactionStableSelect' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingRooms =
    pendingChoice?.promptKey === 'ui.interactionRoomSelect' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingPlow =
    pendingChoice?.promptKey === 'ui.interactionPlowSelect' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const isSelectingSow =
    pendingChoice?.promptKey === 'ui.interactionSowSelect' &&
    pendingChoice.playerIndex === state.currentPlayerIndex
  const roomPositions = useMemo(
    () => new Set(displayPlayer.roomTiles.map((pos) => positionKey(pos))),
    [displayPlayer.roomTiles],
  )
  const fieldPositions = useMemo(
    () =>
      new Set(
        displayPlayer.fields.map((field) =>
          positionKey({ row: field.row, col: field.col }),
        ),
      ),
    [displayPlayer.fields],
  )
  const fieldMap = useMemo(() => {
    const map = new Map<
      string,
      { crop: 'grain' | 'vegetable' | null; remaining: number }
    >()
    displayPlayer.fields.forEach((field) => {
      map.set(positionKey({ row: field.row, col: field.col }), {
        crop: field.crop,
        remaining: field.remaining,
      })
    })
    return map
  }, [displayPlayer.fields])
  const stablePositions = useMemo(
    () => new Set(displayPlayer.stableTiles.map((pos) => positionKey(pos))),
    [displayPlayer.stableTiles],
  )
  const existingFenceSet = useMemo(
    () => new Set(displayPlayer.fenceSegments ?? []),
    [displayPlayer.fenceSegments],
  )
  const pendingFenceSet = useMemo(
    () => new Set(pendingFenceEdges),
    [pendingFenceEdges],
  )
  const canSelectFences =
    isSelectingFences && displayPlayer.id === currentPlayer.id
  const canSelectStables =
    isSelectingStables && displayPlayer.id === currentPlayer.id
  const canSelectRooms =
    isSelectingRooms && displayPlayer.id === currentPlayer.id
  const canSelectPlow = isSelectingPlow && displayPlayer.id === currentPlayer.id
  const canSelectSow = isSelectingSow && displayPlayer.id === currentPlayer.id
  const pendingRoomSet = useMemo(
    () => new Set(pendingRoomTiles.map((tile) => positionKey(tile))),
    [pendingRoomTiles],
  )
  const pendingStableSet = useMemo(
    () => new Set(pendingStableTiles.map((tile) => positionKey(tile))),
    [pendingStableTiles],
  )
  const maxRoomSelections = useMemo(() => {
    const cost = getBuildRoomCost(displayPlayer.houseType)
    const resourceMax = Object.entries(cost).reduce((max, [key, value]) => {
      if (typeof value !== 'number' || value <= 0) return max
      const resourceKey = key as keyof Resource
      const available = displayPlayer.resources[resourceKey] ?? 0
      return Math.min(max, Math.floor(available / value))
    }, Number.POSITIVE_INFINITY)
    const openTiles =
      FARM_ROWS * FARM_COLS -
      roomPositions.size -
      fieldPositions.size -
      stablePositions.size
    if (!Number.isFinite(resourceMax)) return 0
    return Math.max(0, Math.min(openTiles, resourceMax))
  }, [
    displayPlayer.houseType,
    displayPlayer.resources,
    roomPositions.size,
    fieldPositions.size,
    stablePositions.size,
  ])
  const maxStableSelections = useMemo(() => {
    const resourceMax = Math.floor(displayPlayer.resources.wood / stableWoodCost)
    const remaining = Math.max(0, 4 - stablePositions.size)
    const openTiles =
      FARM_ROWS * FARM_COLS -
      roomPositions.size -
      fieldPositions.size -
      stablePositions.size
    return Math.max(0, Math.min(openTiles, resourceMax, remaining))
  }, [
    displayPlayer.resources.wood,
    roomPositions.size,
    fieldPositions.size,
    stablePositions.size,
  ])
  const hasAnytimeReorg =
    currentPlayer.resources.sheep +
      currentPlayer.resources.boar +
      currentPlayer.resources.cattle >
    0
  const reorgPlayer =
    pendingAnimalReorg !== null
      ? state.players[pendingAnimalReorg.playerIndex]
      : null
  const isReorgActive =
    !!pendingAnimalReorg &&
    !!animalReorg &&
    !!reorgPlayer &&
    reorgPlayer.id === displayPlayer.id
  const reorgZoneMap = useMemo(() => {
    const map = new Map<string, { capacity: number; zoneType: string }>()
    reorgPlayer?.pastures.forEach((pasture) => {
      map.set(pasture.id, {
        capacity: getPastureCapacity(pasture),
        zoneType: 'pasture',
      })
    })
    if (reorgPlayer) {
      map.set('house', { capacity: 1, zoneType: 'house' })
      getLooseStableKeys(reorgPlayer).forEach((key) => {
        map.set(`stable:${key}`, { capacity: 1, zoneType: 'stable' })
      })
    }
    return map
  }, [reorgPlayer])
  const reorgTotals = useMemo(() => {
    const totals = { sheep: 0, boar: 0, cattle: 0 }
    animalReorg?.zones.forEach((zone) => {
      if (!zone.animalType) return
      totals[zone.animalType] += zone.animalCount
    })
    return totals
  }, [animalReorg])
  const reorgAvailable = reorgPlayer
    ? {
        sheep: reorgPlayer.resources.sheep,
        boar: reorgPlayer.resources.boar,
        cattle: reorgPlayer.resources.cattle,
      }
    : null
  const reorgRemaining = reorgAvailable
    ? {
        sheep: reorgAvailable.sheep - reorgTotals.sheep,
        boar: reorgAvailable.boar - reorgTotals.boar,
        cattle: reorgAvailable.cattle - reorgTotals.cattle,
      }
    : null
  const hasReorgOverflow =
    !!reorgRemaining &&
    (reorgRemaining.sheep < 0 ||
      reorgRemaining.boar < 0 ||
      reorgRemaining.cattle < 0)
  const reorgUnassignedTotal = reorgRemaining
    ? reorgRemaining.sheep + reorgRemaining.boar + reorgRemaining.cattle
    : 0
  const fallbackPastureTiles = useMemo(() => {
    if (!displayPlayer.fenceSegments || displayPlayer.fenceSegments.length === 0) {
      return []
    }
    const needsFallback = displayPlayer.pastures.some(
      (pasture) => !pasture.tiles || pasture.tiles.length === 0,
    )
    if (!needsFallback) return []
    const edgeSet = new Set(displayPlayer.fenceSegments)
    return computeFencedRegions(edgeSet)
      .filter((region) => region.fenced)
      .map((region) => region.tiles)
  }, [displayPlayer.fenceSegments, displayPlayer.pastures])
  const pastureTiles = useMemo(() => {
    const map = new Map<string, { pastureId: string; isCorner: boolean }>()
    displayPlayer.pastures.forEach((pasture, index) => {
      const tiles =
        pasture.tiles && pasture.tiles.length > 0
          ? pasture.tiles
          : fallbackPastureTiles[index] ?? []
      if (tiles.length === 0) return
      let corner = tiles[0]
      tiles.forEach((tile) => {
        if (tile.row > corner.row) {
          corner = tile
          return
        }
        if (tile.row === corner.row && tile.col > corner.col) {
          corner = tile
        }
      })
      tiles.forEach((tile) => {
        const key = positionKey(tile)
        map.set(key, {
          pastureId: pasture.id,
          isCorner: tile.row === corner.row && tile.col === corner.col,
        })
      })
    })
    return map
  }, [displayPlayer.pastures, fallbackPastureTiles])
  const plowSelectableSet = useMemo(() => {
    if (!canSelectPlow) return new Set<string>()
    const fieldKeys = new Set(
      displayPlayer.fields.map((field) =>
        positionKey({ row: field.row, col: field.col }),
      ),
    )
    const occupied = new Set<string>()
    roomPositions.forEach((key) => occupied.add(key))
    fieldPositions.forEach((key) => occupied.add(key))
    stablePositions.forEach((key) => occupied.add(key))
    pastureTiles.forEach((_, key) => occupied.add(key))
    if (fieldKeys.size === 0) {
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
        fieldKeys.has(`${pos.row + delta.dr}-${pos.col + delta.dc}`),
      )
      if (adjacent) result.add(key)
    })
    return result
  }, [
    canSelectPlow,
    displayPlayer.fields,
    fieldPositions,
    roomPositions,
    stablePositions,
    pastureTiles,
  ])
  const sowSelectionTotals = useMemo(() => {
    const totals = { grain: 0, vegetable: 0 }
    Object.values(pendingSowSelections).forEach((crop) => {
      if (crop === 'grain') totals.grain += 1
      if (crop === 'vegetable') totals.vegetable += 1
    })
    return totals
  }, [pendingSowSelections])
  const sowRemaining = useMemo(() => {
    return {
      grain: Math.max(0, displayPlayer.resources.grain - sowSelectionTotals.grain),
      vegetable: Math.max(
        0,
        displayPlayer.resources.vegetable - sowSelectionTotals.vegetable,
      ),
    }
  }, [displayPlayer.resources.grain, displayPlayer.resources.vegetable, sowSelectionTotals])
  const pastureDisplayMap = useMemo(() => {
    const map = new Map<
      string,
      { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }
    >()
    if (isReorgActive && animalReorg) {
      animalReorg.zones
        .filter((zone) => zone.zoneType === 'pasture')
        .forEach((zone) => {
          map.set(zone.id, {
            animalType: zone.animalType,
            animalCount: zone.animalCount,
          })
        })
      return map
    }
    displayPlayer.pastures.forEach((pasture) => {
      map.set(pasture.id, {
        animalType: pasture.animalType,
        animalCount: pasture.animalCount,
      })
    })
    return map
  }, [displayPlayer.pastures, animalReorg, isReorgActive])
  const houseDisplay = useMemo(() => {
    if (isReorgActive && animalReorg) {
      const zone = animalReorg.zones.find((entry) => entry.zoneType === 'house')
      return {
        animalType: zone?.animalType ?? null,
        animalCount: zone?.animalCount ?? 0,
      }
    }
    return {
      animalType: displayPlayer.houseAnimalType ?? null,
      animalCount: displayPlayer.houseAnimalCount ?? 0,
    }
  }, [
    animalReorg,
    displayPlayer.houseAnimalCount,
    displayPlayer.houseAnimalType,
    isReorgActive,
  ])
  const stableDisplayMap = useMemo(() => {
    const map = new Map<
      string,
      { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }
    >()
    if (isReorgActive && animalReorg) {
      animalReorg.zones
        .filter((zone) => zone.zoneType === 'stable')
        .forEach((zone) => {
          const key = zone.id.replace('stable:', '')
          map.set(key, {
            animalType: zone.animalType,
            animalCount: zone.animalCount,
          })
        })
      return map
    }
    const stableKeys = getLooseStableKeys(displayPlayer)
    stableKeys.forEach((key) => {
      const type = displayPlayer.stableAnimals?.[key] ?? null
      map.set(key, { animalType: type, animalCount: type ? 1 : 0 })
    })
    return map
  }, [animalReorg, displayPlayer, isReorgActive])
  const pastureCapacityMap = useMemo(() => {
    const map = new Map<string, number>()
    displayPlayer.pastures.forEach((pasture) => {
      map.set(pasture.id, getPastureCapacity(pasture))
    })
    return map
  }, [displayPlayer.pastures])
  const formatFenceEdge = (edgeId: string) => {
    const match = edgeId.match(/^(H|V)-(\d+)-(\d+)$/)
    if (!match) return edgeId
    const type = match[1]
    const row = Number(match[2])
    const col = Number(match[3])
    if (type === 'H') {
      if (row === 0) {
        return t(locale, 'ui.fenceEdgeTop', { row: 0, col })
      }
      return t(locale, 'ui.fenceEdgeBottom', { row: row - 1, col })
    }
    if (col === 0) {
      return t(locale, 'ui.fenceEdgeLeft', { row, col: 0 })
    }
    return t(locale, 'ui.fenceEdgeRight', { row, col: col - 1 })
  }
  const formatFenceEdges = (edges: string[]) =>
    edges.length === 0 ? '' : edges.map(formatFenceEdge).join('，')
  const fenceErrorText = useMemo(() => {
    if (!fenceError) return ''
    const edgeList =
      fenceError.newEdges.length > 0
        ? formatFenceEdges(fenceError.newEdges)
        : formatFenceEdges(fenceError.edges)
    if (fenceError.code === 'INVALID_EDGE') {
      return t(locale, 'ui.fenceErrorInvalidEdge', { edges: edgeList })
    }
    if (fenceError.code === 'NO_NEW_FENCES') {
      return t(locale, 'ui.fenceErrorNoNew', { edges: edgeList })
    }
    if (fenceError.code === 'NOT_ENOUGH_WOOD') {
      return t(locale, 'ui.fenceErrorNoWood', { edges: edgeList })
    }
    if (fenceError.code === 'MAX_FENCES_EXCEEDED') {
      return t(locale, 'ui.fenceErrorMax', { edges: edgeList })
    }
    if (fenceError.code === 'FENCE_NOT_CONNECTED') {
      return t(locale, 'ui.fenceErrorNotConnected', { edges: edgeList })
    }
    if (fenceError.code === 'NO_ENCLOSED_AREA') {
      return t(locale, 'ui.fenceErrorNotClosed', { edges: edgeList })
    }
    if (fenceError.code === 'ENCLOSED_TILE_OCCUPIED') {
      return t(locale, 'ui.fenceErrorOccupied', { edges: edgeList })
    }
    return t(locale, 'ui.fenceErrorUnknown', { edges: edgeList })
  }, [fenceError, locale])
  const roomErrorText = useMemo(() => {
    if (!roomError) return ''
    if (roomError === 'NO_SELECTION') {
      return t(locale, 'ui.roomErrorNoSelection')
    }
    if (roomError === 'INVALID_POSITION') {
      return t(locale, 'ui.roomErrorInvalid')
    }
    if (roomError === 'OCCUPIED') {
      return t(locale, 'ui.roomErrorOccupied')
    }
    if (roomError === 'NOT_CONNECTED') {
      return t(locale, 'ui.roomErrorNotConnected')
    }
    if (roomError === 'NOT_ENOUGH_RESOURCES') {
      return t(locale, 'ui.roomErrorNoResources')
    }
    return t(locale, 'ui.roomErrorUnknown')
  }, [roomError, locale])
  const stableErrorText = useMemo(() => {
    if (!stableError) return ''
    if (stableError === 'NO_SELECTION') {
      return t(locale, 'ui.stableErrorNoSelection')
    }
    if (stableError === 'INVALID_POSITION') {
      return t(locale, 'ui.stableErrorInvalid')
    }
    if (stableError === 'OCCUPIED') {
      return t(locale, 'ui.stableErrorOccupied')
    }
    if (stableError === 'NOT_ENOUGH_RESOURCES') {
      return t(locale, 'ui.stableErrorNoResources')
    }
    if (stableError === 'LIMIT_REACHED') {
      return t(locale, 'ui.stableErrorLimit')
    }
    return t(locale, 'ui.stableErrorUnknown')
  }, [stableError, locale])
  const plowErrorText = useMemo(() => {
    if (!plowError) return ''
    if (plowError === 'NO_SELECTION') {
      return t(locale, 'ui.plowErrorNoSelection')
    }
    if (plowError === 'INVALID_POSITION') {
      return t(locale, 'ui.plowErrorInvalid')
    }
    if (plowError === 'OCCUPIED') {
      return t(locale, 'ui.plowErrorOccupied')
    }
    if (plowError === 'NOT_ADJACENT') {
      return t(locale, 'ui.plowErrorNotAdjacent')
    }
    if (plowError === 'FENCED') {
      return t(locale, 'ui.plowErrorFenced')
    }
    return t(locale, 'ui.plowErrorUnknown')
  }, [plowError, locale])
  const sowErrorText = useMemo(() => {
    if (!sowError) return ''
    if (sowError === 'NO_SELECTION') {
      return t(locale, 'ui.sowErrorNoSelection')
    }
    if (sowError === 'INVALID_POSITION') {
      return t(locale, 'ui.sowErrorInvalid')
    }
    if (sowError === 'NOT_EMPTY') {
      return t(locale, 'ui.sowErrorNotEmpty')
    }
    if (sowError === 'NOT_ENOUGH_SEEDS') {
      return t(locale, 'ui.sowErrorNoSeeds')
    }
    if (sowError === 'INVALID_CROP') {
      return t(locale, 'ui.sowErrorInvalidCrop')
    }
    return t(locale, 'ui.sowErrorUnknown')
  }, [sowError, locale])

  useEffect(() => {
    if (!isSelectingFences) {
      setPendingFenceEdges([])
      setFenceError(null)
    }
  }, [isSelectingFences, setPendingFenceEdges, setFenceError])
  useEffect(() => {
    if (!isSelectingRooms) {
      setPendingRoomTiles([])
      setRoomError(null)
    }
  }, [isSelectingRooms, setPendingRoomTiles, setRoomError])
  useEffect(() => {
    if (!isSelectingStables) {
      setPendingStableTiles([])
      setStableError(null)
    }
  }, [isSelectingStables, setPendingStableTiles, setStableError])
  useEffect(() => {
    if (!isSelectingPlow) {
      setPendingPlowTile(null)
      setPlowError(null)
    }
  }, [isSelectingPlow, setPendingPlowTile, setPlowError])
  useEffect(() => {
    if (!isSelectingSow) {
      setPendingSowSelections({})
      setSowError(null)
    }
  }, [isSelectingSow, setPendingSowSelections, setSowError])

  useEffect(() => {
    if (state.gameOver) {
      setShowScoringPad(true)
    }
  }, [state.gameOver])

  const actionMap = useMemo(
    () => new Map(state.actionSpaces.map((space) => [space.id, space])),
    [state.actionSpaces],
  )
  const scoreSummaries = useMemo(() => computeScores(state), [state])
  const futureCardResources = useMemo(() => {
    const byCard = new Map<string, Map<string, Partial<Resource>>>()
    state.futureMeeples.forEach((entry) => {
      let byPlayer = byCard.get(entry.cardId)
      if (!byPlayer) {
        byPlayer = new Map()
        byCard.set(entry.cardId, byPlayer)
      }
      let resources = byPlayer.get(entry.playerId)
      if (!resources) {
        resources = {}
        byPlayer.set(entry.playerId, resources)
      }
      Object.entries(entry.resources).forEach(([key, value]) => {
        const amount = value ?? 0
        if (amount <= 0) return
        const typedKey = key as keyof Resource
        resources[typedKey] = (resources[typedKey] ?? 0) + amount
      })
    })
    const playerById = new Map(state.players.map((player) => [player.id, player]))
    const result: Record<
      string,
      { playerId: string; name: string; color: PlayerState['color']; resources: Partial<Resource> }[]
    > = {}
    byCard.forEach((byPlayer, cardId) => {
      result[cardId] = Array.from(byPlayer.entries()).map(([playerId, resources]) => {
        const player = playerById.get(playerId)
        return {
          playerId,
          name: player?.name ?? playerId,
          color: player?.color ?? 'red',
          resources,
        }
      })
    })
    return result
  }, [state.futureMeeples, state.players])
  const roundOpenById = useMemo(
    () => createRoundOpenById(state.roundActionOrder),
    [state.roundActionOrder],
  )
  const playerCount = state.players.length
  const baseActions = useMemo(
    () =>
      baseActionOrder
        .map((id) => actionMap.get(id))
        .filter((space): space is ActionSpace => !!space)
        .filter((space) => isActionForPlayerCount(space, playerCount)),
    [actionMap, playerCount],
  )
  const roundSlots = useMemo<{ round: number; action?: ActionSpace }[]>(
    () =>
      state.roundActionOrder.map((id, index) => {
        const action = id ? actionMap.get(id) : undefined
        return {
          round: index + 1,
          action:
            action && isActionForPlayerCount(action, playerCount)
              ? action
              : undefined,
        }
      }),
    [actionMap, state.roundActionOrder, playerCount],
  )
  const farmCells = useMemo(() => {
    const rows = 7
    const cols = 11
    const cells: {
      key: string
      type: 'tile' | 'post' | 'fence-h' | 'fence-v'
      tileRow?: number
      tileCol?: number
      fenceId?: string
    }[] = []
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const isTile = row % 2 === 1 && col % 2 === 1
        const isPost = row % 2 === 0 && col % 2 === 0
        const isFenceHorizontal = row % 2 === 0 && col % 2 === 1
        const isFenceVertical = row % 2 === 1 && col % 2 === 0
        let tileRow: number | undefined
        let tileCol: number | undefined
        let fenceId: string | undefined
        if (isTile) {
          tileRow = (row - 1) / 2
          tileCol = (col - 1) / 2
        }
        if (isFenceHorizontal) {
          fenceId = `H-${row / 2}-${(col - 1) / 2}`
        }
        if (isFenceVertical) {
          fenceId = `V-${(row - 1) / 2}-${col / 2}`
        }
        cells.push({
          key: `${row}-${col}`,
          type: isTile
            ? 'tile'
            : isPost
              ? 'post'
              : isFenceHorizontal
                ? 'fence-h'
                : 'fence-v',
          tileRow,
          tileCol,
          fenceId,
        })
      }
    }
    return cells
  }, [])

  const allWorkersUsed = state.players.every(
    (player) => player.workersAvailable === 0,
  )

  const toggleRoomTile = (tile: FarmTilePosition) =>
    toggleRoomTileInternal(tile, maxRoomSelections, positionKey)
  const toggleStableTile = (tile: FarmTilePosition) =>
    toggleStableTileInternal(tile, maxStableSelections, positionKey)
  const togglePlowTile = (tile: FarmTilePosition) =>
    togglePlowTileInternal(tile, positionKey)
  const updateSowSelection = (tile: FarmTilePosition, value: string) =>
    updateSowSelectionInternal(tile, value, positionKey)

  const canTakeActionInUI = (space: ActionSpace, player: PlayerState) =>
    !pendingChoice &&
    pendingNextPlayerIndex === null &&
    !pendingAnimalReorg &&
    !(harvestContext && harvestContext.pending.length > 0) &&
    canTakeAction(state, space, player, roundOpenById, isActionForPlayerCount)

  const logAction = (
    nextState: GameState,
    player: PlayerState,
    space: ActionSpace,
    beforePlayer: PlayerState,
  ) => {
    const houseLabel = (type: PlayerState['houseType']) => {
      if (type === 'clay') return t(locale, 'ui.houseClay')
      if (type === 'stone') return t(locale, 'ui.houseStone')
      return t(locale, 'ui.houseWood')
    }
    const gains: Resource = { ...emptyResources }
    const costs: Resource = { ...emptyResources }
    resourceKeyList.forEach((key) => {
      const delta = player.resources[key] - beforePlayer.resources[key]
      if (delta > 0) gains[key] = delta
      if (delta < 0) costs[key] = Math.abs(delta)
    })
    const gainText = formatResources(locale, gains, true)
    const costText = formatResources(locale, costs, true)
    const effects: string[] = []
    if (player.rooms > beforePlayer.rooms) {
      effects.push(
        t(locale, 'log.effectBuildRoom', {
          count: player.rooms - beforePlayer.rooms,
        }),
      )
    }
    if (player.familySize > beforePlayer.familySize) {
      effects.push(
        t(locale, 'log.effectGrowFamily', {
          count: player.familySize - beforePlayer.familySize,
        }),
      )
    }
    if (player.fields.length > beforePlayer.fields.length) {
      effects.push(
        t(locale, 'log.effectPlow', {
          count: player.fields.length - beforePlayer.fields.length,
        }),
      )
    }
    let sowGrain = 0
    let sowVegetable = 0
    player.fields.forEach((field, index) => {
      const beforeField = beforePlayer.fields[index]
      if (!beforeField || beforeField.crop) return
      if (field.crop === 'grain') sowGrain += 1
      if (field.crop === 'vegetable') sowVegetable += 1
    })
    if (sowGrain > 0) {
      effects.push(t(locale, 'log.effectSowGrain', { count: sowGrain }))
    }
    if (sowVegetable > 0) {
      effects.push(
        t(locale, 'log.effectSowVegetable', { count: sowVegetable }),
      )
    }
    if (space.id === 'grain-utilization') {
      const bakedGrain = costs.grain
      const bakedFood = gains.food
      if ((bakedGrain ?? 0) > 0 && (bakedFood ?? 0) > 0) {
        effects.push(
          t(locale, 'log.effectBakeBread', {
            count: bakedGrain ?? 0,
            food: bakedFood ?? 0,
          }),
        )
      }
    }
    if (player.houseType !== beforePlayer.houseType) {
      effects.push(
        t(locale, 'log.effectRenovate', {
          from: houseLabel(beforePlayer.houseType),
          to: houseLabel(player.houseType),
        }),
      )
    }
    if (player.fences > beforePlayer.fences) {
      effects.push(
        t(locale, 'log.effectFencing', {
          count: player.fences - beforePlayer.fences,
        }),
      )
    }
    const newImprovements = player.improvements.filter(
      (id) => !beforePlayer.improvements.includes(id),
    )
    if (newImprovements.length > 0) {
      effects.push(
        t(locale, 'log.effectImprovement', {
          improvements: newImprovements
            .map((id) => t(locale, `improvements.${id}.name`))
            .join(' · '),
        }),
      )
    }
    const newMinorImprovements = player.minorPlayed.filter(
      (id) => !beforePlayer.minorPlayed.includes(id),
    )
    if (newMinorImprovements.length > 0) {
      effects.push(
        t(locale, 'log.effectMinorImprovement', {
          improvements: newMinorImprovements
            .map((id) => t(locale, `minorImprovements.${id}.name`))
            .join(' · '),
        }),
      )
    }
    if (!beforePlayer.startPlayer && player.startPlayer) {
      effects.push(t(locale, 'log.effectStartPlayer'))
    }
    const segments: string[] = []
    if (gainText) {
      segments.push(t(locale, 'log.gains', { resources: gainText }))
    }
    if (costText) {
      segments.push(t(locale, 'log.costs', { resources: costText }))
    }
    if (effects.length > 0) {
      segments.push(t(locale, 'log.effects', { effects: effects.join(' · ') }))
    }
    const detail = segments.length > 0 ? ` · ${segments.join(' · ')}` : ''
    nextState.log.unshift({
      key: 'log.actionDetail',
      params: {
        player: player.name,
        action: t(locale, space.nameKey),
        detail,
      },
    })
  }

  const runEngineSteps = (
    engine: ReturnType<typeof createEngine>,
    nextState: GameState,
    player: PlayerState,
    targetSpace: ActionSpace,
    playerIndex: number,
  ):
    | { type: 'choice'; choice: ActionChoiceOption[]; promptKey?: string }
    | { type: 'done' }
    | { type: 'fail'; logKey: string }
    | { type: 'reorg'; playerIndex: number; spaceId: string } => {
    return runEngineStepsCore({
      engine,
      nextState,
      player,
      targetSpace,
      playerIndex,
      logAction,
      clonePlayer: (snapshotPlayer) =>
        typeof structuredClone === 'function'
          ? structuredClone(snapshotPlayer)
          : (JSON.parse(JSON.stringify(snapshotPlayer)) as PlayerState),
    })
  }

  const filterCultivationOptions = (
    options: ActionChoiceOption[],
    nextState: GameState,
    playerIndex: number,
    promptKey?: string,
  ) => {
    if (promptKey !== 'ui.interactionCultivationSelect') return options
    const startPlayer = actionStartSnapshot?.players[playerIndex]
    const currentPlayer = nextState.players[playerIndex]
    if (!startPlayer || !currentPlayer) return options
    const beforeFields = startPlayer.fields.length
    const afterFields = currentPlayer.fields.length
    const beforeSown = startPlayer.fields.filter((field) => field.crop).length
    const afterSown = currentPlayer.fields.filter((field) => field.crop).length
    const plowDone = afterFields > beforeFields
    const sowDone = afterSown > beforeSown
    return options.filter((option) => {
      if (option.labelKey === 'actions.plow.name' && (plowDone || sowDone)) {
        return false
      }
      if (option.labelKey === 'actions.sow.name' && sowDone) {
        return false
      }
      return true
    })
  }

  const continueAfterExternalUpdate = (
    engine: ReturnType<typeof createEngine>,
    nextState: GameState,
    player: PlayerState,
    targetSpace: ActionSpace,
    playerIndex: number,
  ) => {
    const progress = runEngineSteps(
      engine,
      nextState,
      player,
      targetSpace,
      playerIndex,
    )
    if (progress.type === 'reorg') {
      setPendingAnimalReorg({
        playerIndex: progress.playerIndex,
        spaceId: progress.spaceId,
      })
      setAnimalReorg(createAnimalReorgState(player))
      setPendingChoice(null)
      updateState(nextState)
      return
    }
    if (progress.type === 'choice') {
      if (progress.promptKey === 'ui.interactionFenceSelect') {
        setPendingFenceEdges([])
        setFenceError(null)
      }
      if (progress.promptKey === 'ui.interactionStableSelect') {
        setPendingStableTiles([])
        setStableError(null)
      }
      if (progress.promptKey === 'ui.interactionRoomSelect') {
        setPendingRoomTiles([])
        setRoomError(null)
      }
      if (progress.promptKey === 'ui.interactionPlowSelect') {
        setPendingPlowTile(null)
        setPlowError(null)
      }
      if (progress.promptKey === 'ui.interactionSowSelect') {
        setPendingSowSelections({})
        setSowError(null)
      }
      const filteredOptions = filterCultivationOptions(
        progress.choice,
        nextState,
        playerIndex,
        progress.promptKey,
      )
      if (
        progress.promptKey === 'ui.interactionCultivationSelect' &&
        filteredOptions.length === 1 &&
        filteredOptions[0]?.value === '__done__'
      ) {
        engine.resolveChoice('__done__', {
          state: nextState,
          player,
          space: targetSpace,
        })
        continueAfterExternalUpdate(
          engine,
          nextState,
          player,
          targetSpace,
          playerIndex,
        )
        return
      }
      setPendingChoice({
        promptKey: progress.promptKey,
        options: filteredOptions,
        playerIndex,
        spaceId: targetSpace.id,
        fenceExtraWood:
          progress.promptKey === 'ui.interactionFenceSelect' &&
          targetSpace.id === 'farm-redevelopment'
            ? 1
            : 0,
      })
      updateState(nextState)
      return
    }
    if (progress.type === 'fail') {
      targetSpace.takenBy = null
      player.workersAvailable += 1
      nextState.log.unshift({
        key: progress.logKey,
        params: { player: player.name },
      })
      setActionStartSnapshot(null)
      setPendingChoice(null)
      engineRef.current = null
      updateState(nextState)
      return
    }
    engineRef.current = null
    const nextIndex = nextPlayerIndex(
      nextState.players,
      nextState.currentPlayerIndex,
    )
    setPendingNextPlayerIndex(nextIndex)
    setPendingChoice(null)
    updateState(nextState)
  }

  const takeAction = (space: ActionSpace) => {
    if (!canTakeActionInUI(space, currentPlayer)) return
    const nextState = cloneState(state)
    pushHistorySnapshot(nextState)
    if (!actionStartSnapshot) {
      setActionStartSnapshot(cloneState(state))
    }
    const player = nextState.players[nextState.currentPlayerIndex]
    const targetSpace = nextState.actionSpaces.find((item) => item.id === space.id)
    if (!targetSpace) return
    targetSpace.takenBy = player.id
    player.workersAvailable -= 1
    const engine = createEngine(targetSpace.id)
    engineRef.current = engine
    const progress = runEngineSteps(
      engine,
      nextState,
      player,
      targetSpace,
      nextState.currentPlayerIndex,
    )
    if (progress.type === 'fail') {
      targetSpace.takenBy = null
      player.workersAvailable += 1
      nextState.log.unshift({
        key: progress.logKey,
        params: { player: player.name },
      })
      setActionStartSnapshot(null)
      engineRef.current = null
      updateState(nextState)
      return
    }
    if (progress.type === 'reorg') {
      setPendingAnimalReorg({
        playerIndex: progress.playerIndex,
        spaceId: progress.spaceId,
      })
      setAnimalReorg(createAnimalReorgState(player))
      updateState(nextState)
      return
    }
    if (progress.type === 'choice') {
      if (progress.promptKey === 'ui.interactionFenceSelect') {
        setPendingFenceEdges([])
        setFenceError(null)
      }
      if (progress.promptKey === 'ui.interactionRoomSelect') {
        setPendingRoomTiles([])
        setRoomError(null)
      }
      if (progress.promptKey === 'ui.interactionStableSelect') {
        setPendingStableTiles([])
        setStableError(null)
      }
      if (progress.promptKey === 'ui.interactionPlowSelect') {
        setPendingPlowTile(null)
        setPlowError(null)
      }
      if (progress.promptKey === 'ui.interactionSowSelect') {
        setPendingSowSelections({})
        setSowError(null)
      }
      const filteredOptions = filterCultivationOptions(
        progress.choice,
        nextState,
        nextState.currentPlayerIndex,
        progress.promptKey,
      )
      if (
        progress.promptKey === 'ui.interactionCultivationSelect' &&
        filteredOptions.length === 1 &&
        filteredOptions[0]?.value === '__done__'
      ) {
        engine.resolveChoice('__done__', {
          state: nextState,
          player,
          space: targetSpace,
        })
        continueAfterExternalUpdate(
          engine,
          nextState,
          player,
          targetSpace,
          nextState.currentPlayerIndex,
        )
        return
      }
      setPendingChoice({
        promptKey: progress.promptKey,
        options: filteredOptions,
        playerIndex: nextState.currentPlayerIndex,
        spaceId: space.id,
        fenceExtraWood:
          progress.promptKey === 'ui.interactionFenceSelect' &&
          space.id === 'farm-redevelopment'
            ? 1
            : 0,
      })
      updateState(nextState)
      void persistGame(nextState)
      return
    }
    engineRef.current = null
    const nextIndex = nextPlayerIndex(
      nextState.players,
      nextState.currentPlayerIndex,
    )
    setPendingNextPlayerIndex(nextIndex)
    updateState(nextState)
  }

  const confirmNextPlayer = () => {
    if (pendingNextPlayerIndex === null) return
    const current = state.players[state.currentPlayerIndex]
    if (current && hasPendingAnimals(current) && !pendingAnimalReorg) {
      setPendingAnimalReorg({ playerIndex: state.currentPlayerIndex, spaceId: 'pending-animals' })
      setAnimalReorg(createAnimalReorgState(current))
      setViewPlayerId(current.id)
      return
    }
    const nextState = cloneState(state)
    nextState.currentPlayerIndex = pendingNextPlayerIndex
    setViewPlayerId(nextState.players[nextState.currentPlayerIndex]?.id ?? '')
    setPendingNextPlayerIndex(null)
    setActionStartSnapshot(null)
    if (nextState.players.every((player) => player.workersAvailable === 0)) {
      performRoundEnd(nextState)
      return
    }
    updateState(nextState)
    void persistGame(nextState)
  }

  const resolveChoice = async (choice: string) => {
    if (!pendingChoice) return
    pushHistorySnapshot(state)
    if (pendingChoice.promptKey === 'ui.interactionFenceSelect') {
      const nextState = cloneState(state)
      const beforePlayer = state.players[pendingChoice.playerIndex]
      const actionSnapshotPlayer = actionStartSnapshot?.players[pendingChoice.playerIndex]
      const logBeforePlayer =
        pendingChoice.spaceId === 'fencing' ? beforePlayer : actionSnapshotPlayer ?? beforePlayer
      const player = nextState.players[pendingChoice.playerIndex]
      const targetSpace = nextState.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!beforePlayer || !player || !targetSpace) {
        setPendingChoice(null)
        setPendingFenceEdges([])
        setActionStartSnapshot(null)
        updateState(nextState)
        return
      }
      if (choice === 'cancel') {
        if (pendingChoice.spaceId === 'fencing') {
          targetSpace.takenBy = null
          player.workersAvailable += 1
          setActionStartSnapshot(null)
          setPendingChoice(null)
          setPendingFenceEdges([])
          setFenceError(null)
          engineRef.current = null
          updateState(nextState)
          return
        }
        logAction(nextState, player, targetSpace, logBeforePlayer)
        setPendingChoice(null)
        setPendingFenceEdges([])
        setFenceError(null)
        engineRef.current = null
        const nextIndex = nextPlayerIndex(
          nextState.players,
          nextState.currentPlayerIndex,
        )
        setPendingNextPlayerIndex(nextIndex)
        updateState(nextState)
        return
      }
      const data = await validateFence(
        player.id,
        pendingFenceEdges,
        pendingChoice.fenceExtraWood ?? 0,
      )
      if (!data?.state) {
        if (data?.error?.code) {
          setFenceError({
            code: data.error.code,
            edges: data.error.edges ?? [],
            newEdges: data.error.newEdges ?? [],
          })
        } else {
          setFenceError({
            code: 'UNKNOWN',
            edges: pendingFenceEdges,
            newEdges: pendingFenceEdges,
          })
        }
        nextState.log.unshift({
          key: 'log.fencingFail',
          params: { player: player.name },
        })
        updateState(nextState)
        return
      }
      const updated = normalizeState(data.state as GameState)
      const updatedPlayer = updated.players[pendingChoice.playerIndex]
      const updatedSpace = updated.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!updatedPlayer || !updatedSpace) {
        updateState(updated)
        return
      }
      logAction(updated, updatedPlayer, updatedSpace, logBeforePlayer)
      const nextIndex = nextPlayerIndex(
        updated.players,
        updated.currentPlayerIndex,
      )
      setPendingNextPlayerIndex(nextIndex)
      setPendingChoice(null)
      setPendingFenceEdges([])
      setFenceError(null)
      engineRef.current = null
      updateState(updated)
      return
    }
    if (pendingChoice.promptKey === 'ui.interactionRoomSelect') {
      const nextState = cloneState(state)
      const beforePlayer = state.players[pendingChoice.playerIndex]
      const player = nextState.players[pendingChoice.playerIndex]
      const targetSpace = nextState.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!beforePlayer || !player || !targetSpace) {
        setPendingChoice(null)
        setPendingRoomTiles([])
        setRoomError(null)
        setActionStartSnapshot(null)
        updateState(nextState)
        return
      }
      const engine = engineRef.current ?? createEngine(pendingChoice.spaceId)
      if (choice === 'cancel') {
        const result = engine.resolveChoice(choice, {
          state: nextState,
          player,
          space: targetSpace,
        })
        if (result.type === 'fail') {
          targetSpace.takenBy = null
          player.workersAvailable += 1
          nextState.log.unshift({
            key: result.logKey,
            params: { player: player.name },
          })
          setActionStartSnapshot(null)
          setPendingChoice(null)
          setPendingRoomTiles([])
          setRoomError(null)
          engineRef.current = null
          updateState(nextState)
          return
        }
        const progress = runEngineSteps(
          engine,
          nextState,
          player,
          targetSpace,
          pendingChoice.playerIndex,
        )
        if (progress.type === 'reorg') {
          setPendingAnimalReorg({
            playerIndex: progress.playerIndex,
            spaceId: progress.spaceId,
          })
          setAnimalReorg(createAnimalReorgState(player))
          setPendingChoice(null)
          updateState(nextState)
          return
        }
        if (progress.type === 'choice') {
          setPendingChoice({
            promptKey: progress.promptKey,
            options: progress.choice,
            playerIndex: pendingChoice.playerIndex,
            spaceId: pendingChoice.spaceId,
            fenceExtraWood:
              progress.promptKey === 'ui.interactionFenceSelect' &&
              pendingChoice.spaceId === 'farm-redevelopment'
                ? 1
                : 0,
          })
          setPendingRoomTiles([])
          setRoomError(null)
          updateState(nextState)
          return
        }
        const nextIndex = nextPlayerIndex(
          nextState.players,
          nextState.currentPlayerIndex,
        )
        setPendingNextPlayerIndex(nextIndex)
        setPendingChoice(null)
        setPendingRoomTiles([])
        setRoomError(null)
        engineRef.current = null
        updateState(nextState)
        return
      }
      if (pendingRoomTiles.length === 0) {
        setRoomError('NO_SELECTION')
        return
      }
      const costPerRoom = getBuildRoomCost(player.houseType)
      const data = await validateRoom(player.id, pendingRoomTiles, costPerRoom)
      if (!data?.state) {
        setRoomError(data?.error?.code ?? 'UNKNOWN')
        nextState.log.unshift({
          key: 'log.buildRoomFail',
          params: { player: player.name },
        })
        updateState(nextState)
        return
      }
      const updated = normalizeState(data.state as GameState)
      const updatedPlayer = updated.players[pendingChoice.playerIndex]
      const updatedSpace = updated.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!updatedPlayer || !updatedSpace) {
        updateState(updated)
        return
      }
      logAction(updated, updatedPlayer, updatedSpace, beforePlayer)
      const result = engine.resolveChoice(choice, {
        state: updated,
        player: updatedPlayer,
        space: updatedSpace,
      })
      if (result.type === 'fail') {
        updatedSpace.takenBy = null
        updatedPlayer.workersAvailable += 1
        updated.log.unshift({
          key: result.logKey,
          params: { player: updatedPlayer.name },
        })
        setActionStartSnapshot(null)
        setPendingChoice(null)
        setPendingRoomTiles([])
        setRoomError(null)
        engineRef.current = null
        updateState(updated)
        return
      }
      const progress = runEngineSteps(
        engine,
        updated,
        updatedPlayer,
        updatedSpace,
        pendingChoice.playerIndex,
      )
      if (progress.type === 'reorg') {
        setPendingAnimalReorg({
          playerIndex: progress.playerIndex,
          spaceId: progress.spaceId,
        })
        setAnimalReorg(createAnimalReorgState(updatedPlayer))
        setPendingChoice(null)
        updateState(updated)
        return
      }
      if (progress.type === 'choice') {
        setPendingChoice({
          promptKey: progress.promptKey,
          options: filterCultivationOptions(
            progress.choice,
            nextState,
            pendingChoice.playerIndex,
            progress.promptKey,
          ),
          playerIndex: pendingChoice.playerIndex,
          spaceId: pendingChoice.spaceId,
          fenceExtraWood:
            progress.promptKey === 'ui.interactionFenceSelect' &&
            pendingChoice.spaceId === 'farm-redevelopment'
              ? 1
              : 0,
        })
        setPendingRoomTiles([])
        setRoomError(null)
        updateState(updated)
        return
      }
      const nextIndex = nextPlayerIndex(
        updated.players,
        updated.currentPlayerIndex,
      )
      setPendingNextPlayerIndex(nextIndex)
      setPendingChoice(null)
      setPendingRoomTiles([])
      setRoomError(null)
      engineRef.current = null
      updateState(updated)
      return
    }
    if (pendingChoice.promptKey === 'ui.interactionStableSelect') {
      const nextState = cloneState(state)
      const beforePlayer = state.players[pendingChoice.playerIndex]
      const player = nextState.players[pendingChoice.playerIndex]
      const targetSpace = nextState.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!beforePlayer || !player || !targetSpace) {
        setPendingChoice(null)
        setPendingStableTiles([])
        setStableError(null)
        setActionStartSnapshot(null)
        updateState(nextState)
        return
      }
      const engine = engineRef.current ?? createEngine(pendingChoice.spaceId)
      if (choice === 'cancel') {
        const result = engine.resolveChoice(choice, {
          state: nextState,
          player,
          space: targetSpace,
        })
        if (result.type === 'fail') {
          targetSpace.takenBy = null
          player.workersAvailable += 1
          nextState.log.unshift({
            key: result.logKey,
            params: { player: player.name },
          })
          setActionStartSnapshot(null)
          setPendingChoice(null)
          setPendingStableTiles([])
          setStableError(null)
          engineRef.current = null
          updateState(nextState)
          return
        }
        const progress = runEngineSteps(
          engine,
          nextState,
          player,
          targetSpace,
          pendingChoice.playerIndex,
        )
        if (progress.type === 'reorg') {
          setPendingAnimalReorg({
            playerIndex: progress.playerIndex,
            spaceId: progress.spaceId,
          })
          setAnimalReorg(createAnimalReorgState(player))
          setPendingChoice(null)
          updateState(nextState)
          return
        }
        if (progress.type === 'choice') {
          setPendingChoice({
            promptKey: progress.promptKey,
            options: filterCultivationOptions(
              progress.choice,
              nextState,
              pendingChoice.playerIndex,
              progress.promptKey,
            ),
            playerIndex: pendingChoice.playerIndex,
            spaceId: pendingChoice.spaceId,
            fenceExtraWood:
              progress.promptKey === 'ui.interactionFenceSelect' &&
              pendingChoice.spaceId === 'farm-redevelopment'
                ? 1
                : 0,
          })
          setPendingStableTiles([])
          setStableError(null)
          updateState(nextState)
          return
        }
        const nextIndex = nextPlayerIndex(
          nextState.players,
          nextState.currentPlayerIndex,
        )
        setPendingNextPlayerIndex(nextIndex)
        setPendingChoice(null)
        setPendingStableTiles([])
        setStableError(null)
        engineRef.current = null
        updateState(nextState)
        return
      }
      if (pendingStableTiles.length === 0) {
        setStableError('NO_SELECTION')
        return
      }
      const data = await validateStable(player.id, pendingStableTiles)
      if (!data?.state) {
        setStableError(data?.error?.code ?? 'UNKNOWN')
        nextState.log.unshift({
          key: 'log.buildStableFail',
          params: { player: player.name },
        })
        updateState(nextState)
        return
      }
      const updated = normalizeState(data.state as GameState)
      const updatedPlayer = updated.players[pendingChoice.playerIndex]
      const updatedSpace = updated.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!updatedPlayer || !updatedSpace) {
        updateState(updated)
        return
      }
      logAction(updated, updatedPlayer, updatedSpace, beforePlayer)
      const result = engine.resolveChoice(choice, {
        state: updated,
        player: updatedPlayer,
        space: updatedSpace,
      })
      if (result.type === 'fail') {
        updatedSpace.takenBy = null
        updatedPlayer.workersAvailable += 1
        updated.log.unshift({
          key: result.logKey,
          params: { player: updatedPlayer.name },
        })
        setActionStartSnapshot(null)
        setPendingChoice(null)
        setPendingStableTiles([])
        setStableError(null)
        engineRef.current = null
        updateState(updated)
        return
      }
      const progress = runEngineSteps(
        engine,
        updated,
        updatedPlayer,
        updatedSpace,
        pendingChoice.playerIndex,
      )
      if (progress.type === 'reorg') {
        setPendingAnimalReorg({
          playerIndex: progress.playerIndex,
          spaceId: progress.spaceId,
        })
        setAnimalReorg(createAnimalReorgState(updatedPlayer))
        setPendingChoice(null)
        updateState(updated)
        return
      }
      if (progress.type === 'choice') {
        setPendingChoice({
          promptKey: progress.promptKey,
          options: filterCultivationOptions(
            progress.choice,
            updated,
            pendingChoice.playerIndex,
            progress.promptKey,
          ),
          playerIndex: pendingChoice.playerIndex,
          spaceId: pendingChoice.spaceId,
          fenceExtraWood:
            progress.promptKey === 'ui.interactionFenceSelect' &&
            pendingChoice.spaceId === 'farm-redevelopment'
              ? 1
              : 0,
        })
        setPendingStableTiles([])
        setStableError(null)
        updateState(updated)
        return
      }
      const nextIndex = nextPlayerIndex(
        updated.players,
        updated.currentPlayerIndex,
      )
      setPendingNextPlayerIndex(nextIndex)
      setPendingChoice(null)
      setPendingStableTiles([])
      setStableError(null)
      engineRef.current = null
      updateState(updated)
      return
    }
    if (pendingChoice.promptKey === 'ui.interactionPlowSelect') {
      const nextState = cloneState(state)
      const beforePlayer = state.players[pendingChoice.playerIndex]
      const player = nextState.players[pendingChoice.playerIndex]
      const targetSpace = nextState.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!beforePlayer || !player || !targetSpace) {
        setPendingChoice(null)
        setPendingPlowTile(null)
        setPlowError(null)
        setActionStartSnapshot(null)
        updateState(nextState)
        return
      }
      if (choice === 'cancel') {
        if (pendingChoice.spaceId === 'farmland') {
          targetSpace.takenBy = null
          player.workersAvailable += 1
          setActionStartSnapshot(null)
          setPendingChoice(null)
          setPendingPlowTile(null)
          setPlowError(null)
          engineRef.current = null
          updateState(nextState)
          return
        }
        if (pendingChoice.spaceId === 'cultivation') {
          const engine = engineRef.current ?? createEngine(pendingChoice.spaceId)
          engineRef.current = engine
          engine.resolveChoice('cancel', {
            state: nextState,
            player,
            space: targetSpace,
          })
          setPendingChoice(null)
          setPendingPlowTile(null)
          setPlowError(null)
          continueAfterExternalUpdate(
            engine,
            nextState,
            player,
            targetSpace,
            pendingChoice.playerIndex,
          )
          return
        }
        logAction(nextState, player, targetSpace, beforePlayer)
        setPendingChoice(null)
        setPendingPlowTile(null)
        setPlowError(null)
        engineRef.current = null
        const nextIndex = nextPlayerIndex(
          nextState.players,
          nextState.currentPlayerIndex,
        )
        setPendingNextPlayerIndex(nextIndex)
        updateState(nextState)
        return
      }
      if (!pendingPlowTile) {
        setPlowError('NO_SELECTION')
        return
      }
      const data = await validatePlow(player.id, pendingPlowTile)
      if (!data?.state) {
        setPlowError(data?.error?.code ?? 'UNKNOWN')
        nextState.log.unshift({
          key: 'log.plowFail',
          params: { player: player.name },
        })
        updateState(nextState)
        return
      }
      const updated = normalizeState(data.state as GameState)
      const updatedPlayer = updated.players[pendingChoice.playerIndex]
      const updatedSpace = updated.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!updatedPlayer || !updatedSpace) {
        updateState(updated)
        return
      }
      logAction(updated, updatedPlayer, updatedSpace, beforePlayer)
      if (pendingChoice.spaceId === 'cultivation') {
        const engine = engineRef.current ?? createEngine(pendingChoice.spaceId)
        engineRef.current = engine
        engine.resolveChoice('confirm', {
          state: updated,
          player: updatedPlayer,
          space: updatedSpace,
        })
        setPendingChoice(null)
        setPendingPlowTile(null)
        setPlowError(null)
        continueAfterExternalUpdate(
          engine,
          updated,
          updatedPlayer,
          updatedSpace,
          pendingChoice.playerIndex,
        )
        return
      }
      const nextIndex = nextPlayerIndex(
        updated.players,
        updated.currentPlayerIndex,
      )
      setPendingNextPlayerIndex(nextIndex)
      setPendingChoice(null)
      setPendingPlowTile(null)
      setPlowError(null)
      engineRef.current = null
      updateState(updated)
      return
    }
    if (pendingChoice.promptKey === 'ui.interactionSowSelect') {
      const nextState = cloneState(state)
      const beforePlayer = state.players[pendingChoice.playerIndex]
      const player = nextState.players[pendingChoice.playerIndex]
      const targetSpace = nextState.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!beforePlayer || !player || !targetSpace) {
        setPendingChoice(null)
        setPendingSowSelections({})
        setSowError(null)
        setActionStartSnapshot(null)
        updateState(nextState)
        return
      }
      if (choice === 'cancel') {
        if (engineRef.current) {
          const engine = engineRef.current
          engine.resolveChoice('cancel', {
            state: nextState,
            player,
            space: targetSpace,
          })
          setPendingChoice(null)
          setPendingSowSelections({})
          setSowError(null)
          continueAfterExternalUpdate(
            engine,
            nextState,
            player,
            targetSpace,
            pendingChoice.playerIndex,
          )
          return
        }
        logAction(nextState, player, targetSpace, beforePlayer)
        setPendingChoice(null)
        setPendingSowSelections({})
        setSowError(null)
        engineRef.current = null
        const nextIndex = nextPlayerIndex(
          nextState.players,
          nextState.currentPlayerIndex,
        )
        setPendingNextPlayerIndex(nextIndex)
        updateState(nextState)
        return
      }
      const crops = Object.entries(pendingSowSelections).map(([key, crop]) => {
        const [row, col] = key.split('-').map((value) => Number(value))
        return { row, col, crop }
      })
      if (crops.length === 0) {
        setSowError('NO_SELECTION')
        return
      }
      const data = await validateSow(player.id, crops)
      if (!data?.state) {
        setSowError(data?.error?.code ?? 'UNKNOWN')
        nextState.log.unshift({
          key: 'log.sowFail',
          params: { player: player.name },
        })
        updateState(nextState)
        return
      }
      const updated = normalizeState(data.state as GameState)
      const updatedPlayer = updated.players[pendingChoice.playerIndex]
      const updatedSpace = updated.actionSpaces.find(
        (item) => item.id === pendingChoice.spaceId,
      )
      if (!updatedPlayer || !updatedSpace) {
        updateState(updated)
        return
      }
      logAction(updated, updatedPlayer, updatedSpace, beforePlayer)
      if (engineRef.current) {
        const engine = engineRef.current
        engine.resolveChoice('confirm', {
          state: updated,
          player: updatedPlayer,
          space: updatedSpace,
        })
        setPendingChoice(null)
        setPendingSowSelections({})
        setSowError(null)
        continueAfterExternalUpdate(
          engine,
          updated,
          updatedPlayer,
          updatedSpace,
          pendingChoice.playerIndex,
        )
        return
      }
      const nextIndex = nextPlayerIndex(
        updated.players,
        updated.currentPlayerIndex,
      )
      setPendingNextPlayerIndex(nextIndex)
      setPendingChoice(null)
      setPendingSowSelections({})
      setSowError(null)
      engineRef.current = null
      updateState(updated)
      return
    }
    const nextState = cloneState(state)
    const beforePlayer = state.players[pendingChoice.playerIndex]
    const player = nextState.players[pendingChoice.playerIndex]
    const targetSpace = nextState.actionSpaces.find(
      (item) => item.id === pendingChoice.spaceId,
    )
    if (!beforePlayer || !player || !targetSpace) {
      setPendingChoice(null)
      setActionStartSnapshot(null)
      updateState(nextState)
      return
    }
    const engine = engineRef.current ?? createEngine(pendingChoice.spaceId)
    const result = engine.resolveChoice(choice, {
      state: nextState,
      player,
      space: targetSpace,
    })
    if (result.type === 'fail') {
      targetSpace.takenBy = null
      player.workersAvailable += 1
      nextState.log.unshift({
        key: result.logKey,
        params: { player: player.name },
      })
      setActionStartSnapshot(null)
      setPendingChoice(null)
      engineRef.current = null
      updateState(nextState)
      return
    }
    if (result.type === 'choice') {
      const filteredOptions = filterCultivationOptions(
        result.options,
        nextState,
        pendingChoice.playerIndex,
        result.promptKey,
      )
      if (
        result.promptKey === 'ui.interactionCultivationSelect' &&
        filteredOptions.length === 1 &&
        filteredOptions[0]?.value === '__done__'
      ) {
        engine.resolveChoice('__done__', {
          state: nextState,
          player,
          space: targetSpace,
        })
        continueAfterExternalUpdate(
          engine,
          nextState,
          player,
          targetSpace,
          pendingChoice.playerIndex,
        )
        return
      }
      setPendingChoice({
        promptKey: result.promptKey,
        options: filteredOptions,
        playerIndex: pendingChoice.playerIndex,
        spaceId: pendingChoice.spaceId,
        fenceExtraWood:
          result.promptKey === 'ui.interactionFenceSelect' &&
          pendingChoice.spaceId === 'farm-redevelopment'
            ? 1
            : 0,
      })
      updateState(nextState)
      return
    }
    if (result.type === 'ok' || result.type === 'flow') {
      logAction(nextState, player, targetSpace, beforePlayer)
      const progress = runEngineSteps(
        engine,
        nextState,
        player,
        targetSpace,
        pendingChoice.playerIndex,
      )
      if (progress.type === 'reorg') {
        setPendingAnimalReorg({
          playerIndex: progress.playerIndex,
          spaceId: progress.spaceId,
        })
        setAnimalReorg(createAnimalReorgState(player))
        setPendingChoice(null)
        updateState(nextState)
        return
      }
      if (progress.type === 'choice') {
        if (progress.promptKey === 'ui.interactionRoomSelect') {
          setPendingRoomTiles([])
          setRoomError(null)
        }
        if (progress.promptKey === 'ui.interactionStableSelect') {
          setPendingStableTiles([])
          setStableError(null)
        }
        if (progress.promptKey === 'ui.interactionPlowSelect') {
          setPendingPlowTile(null)
          setPlowError(null)
        }
        if (progress.promptKey === 'ui.interactionSowSelect') {
          setPendingSowSelections({})
          setSowError(null)
        }
        setPendingChoice({
          promptKey: progress.promptKey,
          options: progress.choice,
          playerIndex: pendingChoice.playerIndex,
          spaceId: pendingChoice.spaceId,
          fenceExtraWood:
            progress.promptKey === 'ui.interactionFenceSelect' &&
            pendingChoice.spaceId === 'farm-redevelopment'
              ? 1
              : 0,
        })
        updateState(nextState)
        return
      }
      if (progress.type === 'fail') {
        targetSpace.takenBy = null
        player.workersAvailable += 1
        nextState.log.unshift({
          key: progress.logKey,
          params: { player: player.name },
        })
        setActionStartSnapshot(null)
        setPendingChoice(null)
        engineRef.current = null
        updateState(nextState)
        return
      }
      const nextIndex = nextPlayerIndex(
        nextState.players,
        nextState.currentPlayerIndex,
      )
      setPendingNextPlayerIndex(nextIndex)
    }
    setPendingChoice(null)
    engineRef.current = null
    updateState(nextState)
  }

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

  const buildHarvestLogEntries = (
    context: HarvestContext,
    breedSummary: HarvestSummary['breed'],
    nextState: GameState,
  ) =>
    buildHarvestLogEntriesCore({
      locale,
      context,
      breedSummary,
      nextState,
    })

  const applyBreedPhase = (nextState: GameState) => applyBreedPhaseCore(nextState)

  const finalizeRound = (nextState: GameState) => {
    const result = finalizeRoundCore(nextState)
    if (result.type === 'gameOver') {
      updateState(nextState)
      void persistGame(nextState)
      return
    }
    setViewPlayerId(nextState.players[nextState.currentPlayerIndex]?.id ?? '')
    setHistory([])
    setActionStartSnapshot(null)
    updateState(nextState)
    void persistGame(nextState)
  }

  const finishHarvest = (baseState: GameState, context: HarvestContext) => {
    const nextState = cloneState(baseState)
    const breedSummary = applyBreedPhase(nextState)
    applyMajorEffectsToAllPlayers(nextState, 'onHarvest')
    buildHarvestLogEntries(context, breedSummary, nextState)
    setHarvestContext(null)
    setHarvestFeedCounts({})
    const pendingPlayerIndex = findPendingAnimalPlayerIndex(
      nextState,
      hasPendingAnimals,
    )
    if (pendingPlayerIndex !== -1) {
      const pendingPlayer = nextState.players[pendingPlayerIndex]
      if (pendingPlayer) {
        setPendingHarvestFinalizeState(nextState)
        setPendingAnimalReorg({ playerIndex: pendingPlayerIndex, spaceId: 'harvest-breed' })
        setAnimalReorg(createAnimalReorgState(pendingPlayer))
        setViewPlayerId(pendingPlayer.id)
        updateState(nextState)
        return
      }
    }
    finalizeRound(nextState)
  }

  const startHarvest = (baseState: GameState, alreadyPrepared = false) => {
    const nextState = alreadyPrepared ? baseState : cloneState(baseState)
    if (!alreadyPrepared) {
      pushHistorySnapshot(nextState)
    }
    const { context } = startHarvestCore(nextState)
    updateState(nextState)
    if (context.pending.length === 0) {
      finishHarvest(nextState, context)
      return
    }
    setHarvestContext(context)
    setHarvestFeedCounts({})
    const current = context.pending[0]
    if (current) {
      const currentPlayer = nextState.players[current.playerIndex]
      if (currentPlayer) {
        setViewPlayerId(currentPlayer.id)
      }
    }
  }

  const confirmHarvestFeed = (countsOverride?: Record<string, number>) => {
    if (!harvestContext) return
    const nextState = cloneState(state)
    const current = harvestContext.pending[0]
    if (!current) return
    const player = nextState.players[current.playerIndex]
    if (!player) return
    const options = buildHarvestFeedOptionsCore(player, locale, cardLabel)
    const result = confirmHarvestFeedCore({
      nextState,
      context: harvestContext,
      countsOverride,
      harvestFeedCounts,
      options,
    })
    if (!result) return
    updateState(nextState)
    if (result.nextContext.pending.length === 0) {
      finishHarvest(nextState, result.nextContext)
      return
    }
    setHarvestContext(result.nextContext)
    setHarvestFeedCounts({})
    const nextPlayer = nextState.players[result.nextContext.pending[0].playerIndex]
    if (nextPlayer) {
      setViewPlayerId(nextPlayer.id)
    }
  }

  const updateHarvestSelection = (optionId: string, delta: number) => {
    if (!harvestContext) return
    const current = harvestContext.pending[0]
    if (!current) return
    const player = state.players[current.playerIndex]
    if (!player) return
    const options = buildHarvestFeedOptionsCore(player, locale, cardLabel)
    const option = options.find((item) => item.id === optionId)
    if (!option) return
    setHarvestFeedCounts((prev) => {
      const currentValue = prev[optionId] ?? 0
      const usedForResource = options.reduce((sum, item) => {
        if (item.resourceKey !== option.resourceKey) return sum
        return sum + (prev[item.id] ?? 0)
      }, 0)
      const available = player.resources[option.resourceKey]
      const remaining = Math.max(0, available - (usedForResource - currentValue))
      const limit = currentValue + remaining
      const nextValue = Math.max(0, Math.min(currentValue + delta, limit))
      if (nextValue === currentValue) return prev
      return { ...prev, [optionId]: nextValue }
    })
  }

  const performRoundEnd = (baseState: GameState) => {
    const result = prepareRoundEndCore({
      baseState,
      hasPendingAnimals,
      cloneState,
      harvestRounds,
    })
    if (result.type === 'pendingAnimals') {
      const pendingPlayerIndex = result.pendingPlayerIndex
      const pendingPlayer = baseState.players[pendingPlayerIndex]
      setPendingAnimalReorg({
        playerIndex: pendingPlayerIndex,
        spaceId: 'pending-animals',
      })
      setAnimalReorg(createAnimalReorgState(pendingPlayer))
      setViewPlayerId(pendingPlayer.id)
      updateState(baseState)
      return
    }
    const nextState = result.nextState
    pushHistorySnapshot(nextState)
    if (result.type === 'startHarvest') {
      startHarvest(nextState, true)
      return
    }
    finalizeRound(nextState)
  }

  const endRound = () => {
    if (
      !canPerformRoundEnd({
        state,
        allWorkersUsed,
        pendingNextPlayerIndex,
        hasPendingChoice: !!pendingChoice,
        hasPendingAnimalReorg: !!pendingAnimalReorg,
        hasPendingHarvestFeed: !!harvestContext?.pending.length,
      })
    ) {
      return
    }
    performRoundEnd(state)
  }

  const undo = () => {
    setHistory((prev) => {
      if (prev.length === 0) {
        if (actionStartSnapshot) {
          restoreHistorySnapshot(createBaselineSnapshot(actionStartSnapshot))
        }
        return prev
      }
      const previous = prev[prev.length - 1]
      restoreHistorySnapshot(previous)
      return prev.slice(0, prev.length - 1)
    })
  }

  const undoAction = () => {
    setHistory((prev) => {
      if (prev.length === 0) {
        if (actionStartSnapshot) {
          restoreHistorySnapshot(createBaselineSnapshot(actionStartSnapshot))
        }
        return prev
      }
      let index = prev.length - 1
      while (index >= 0 && prev[index].actionStartSnapshot) {
        index -= 1
      }
      if (index < 0) {
        const previous = prev[prev.length - 1]
        restoreHistorySnapshot(previous)
        return prev.slice(0, prev.length - 1)
      }
      const target = prev[index]
      restoreHistorySnapshot(target)
      return prev.slice(0, index)
    })
  }

  const undoRound = () => {
    if (!actionStartSnapshot) return
    pushHistorySnapshot(state)
    const snapshot = createRoundSnapshot(actionStartSnapshot)
    setPendingNextPlayerIndex(null)
    setPendingChoice(null)
    setPendingAnimalReorg(null)
    setAnimalReorg(null)
    setHarvestContext(null)
    setHarvestFeedCounts({})
    setPendingHarvestFinalizeState(null)
    setActionStartSnapshot(null)
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
    engineRef.current = null
    updateState(snapshot)
    void persistGame(snapshot)
  }

  const sowSelectedCount = Object.keys(pendingSowSelections).length

  const resetGame = () => {
    const parsedSeed = Number.parseInt(resetSeedInput, 10)
    const seed = Number.isFinite(parsedSeed) ? parsedSeed : undefined
    const nextState = createInitialState(seed)
    setHistory([])
    updateState(nextState)
    setViewPlayerId(nextState.players[0]?.id ?? '')
    setShowScoringPad(false)
    setPendingNextPlayerIndex(null)
    setPendingChoice(null)
    setPendingAnimalReorg(null)
    setAnimalReorg(null)
    setHarvestContext(null)
    setHarvestFeedCounts({})
    setPendingHarvestFinalizeState(null)
    setActionStartSnapshot(null)
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
    setResetSeedInput(String(nextState.gameSeed))
    void persistGame(nextState)
  }

  const resourceKeys = useMemo(
    () =>
      [
        'wood',
        'clay',
        'reed',
        'stone',
        'food',
        'grain',
        'vegetable',
        'sheep',
        'boar',
        'cattle',
        'begging',
      ] as (keyof Resource)[],
    [],
  )
  const majorIdSet = useMemo(() => new Set(majorImprovementIds), [])
  const minorIdSet = useMemo(() => new Set(minorImprovementIds), [])
  const occupationIdSet = useMemo(() => new Set(occupationIds), [])
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
  const applyDevResource = async () => {
    if (!devPlayerId) return
    const data = await addResource(devPlayerId, devResource, devAmount)
    if (data?.state) {
      const nextState = normalizeState(data.state as GameState)
      updateState(nextState)
      if (devResource === 'sheep' || devResource === 'boar' || devResource === 'cattle') {
        const playerIndex = nextState.players.findIndex(
          (player) => player.id === devPlayerId,
        )
        const targetPlayer = nextState.players[playerIndex]
        if (
          targetPlayer &&
          hasPendingAnimals(targetPlayer) &&
          !pendingChoice &&
          !pendingAnimalReorg
        ) {
          setPendingAnimalReorg({ playerIndex, spaceId: 'dev-add-animals' })
          setAnimalReorg(createAnimalReorgState(targetPlayer))
          setViewPlayerId(targetPlayer.id)
        }
      }
    }
  }

  const applyDevRound = () => {
    if (!Number.isFinite(devRound)) return
    const nextRound = Math.max(1, Math.min(14, Math.floor(devRound)))
    const nextState = cloneState(state)
    nextState.round = nextRound
    setPendingNextPlayerIndex(null)
    setPendingChoice(null)
    setPendingAnimalReorg(null)
    setAnimalReorg(null)
    setActionStartSnapshot(null)
    updateState(nextState)
    void persistGame(nextState)
  }

  const stripCardId = (cardId: string) => cardId.trim()
  const getCardType = (player: PlayerState, cardId: string) => {
    if (majorIdSet.has(cardId)) return 'major'
    if (occupationIdSet.has(cardId)) return 'occupation'
    if (minorIdSet.has(cardId)) return 'minor'
    if (player.occupationHand.includes(cardId)) return 'occupation'
    if (player.occupationPlayed.includes(cardId)) return 'occupation'
    if (player.minorHand.includes(cardId)) return 'minor'
    if (player.minorPlayed.includes(cardId)) return 'minor'
    if (player.improvements.includes(cardId)) return 'major'
    return 'minor'
  }

  const removePlayedCardEntry = (player: PlayerState, cardId: string) => {
    const rawId = cardId
    player.playedCards = player.playedCards.filter((entry) => {
      if (entry === rawId) return false
      const parts = entry.split(':')
      return parts.length < 2 || parts[1] !== rawId
    })
  }

  const removeCardFromAllHands = (cardId: string, nextState: GameState) => {
    nextState.players.forEach((player) => {
      player.minorHand = player.minorHand.filter((entry) => entry !== cardId)
      player.occupationHand = player.occupationHand.filter((entry) => entry !== cardId)
    })
  }

  const removeCardFromAllPlayed = (cardId: string, nextState: GameState) => {
    nextState.players.forEach((player) => {
      player.improvements = player.improvements.filter((entry) => entry !== cardId)
      player.minorPlayed = player.minorPlayed.filter((entry) => entry !== cardId)
      player.occupationPlayed = player.occupationPlayed.filter((entry) => entry !== cardId)
      removePlayedCardEntry(player, cardId)
    })
  }

  const playDevCard = () => {
    const cardId = stripCardId(devCardId)
    if (!cardId) return
    const nextState = cloneState(state)
    const targetPlayer = nextState.players.find((player) => player.id === devPlayerId)
    if (!targetPlayer) return
    const cardType = getCardType(targetPlayer, cardId)
    removeCardFromAllHands(cardId, nextState)
    removeCardFromAllPlayed(cardId, nextState)
    if (cardType === 'major') {
      nextState.availableMajorImprovements = nextState.availableMajorImprovements.filter(
        (entry) => entry !== cardId,
      )
      if (!targetPlayer.improvements.includes(cardId)) {
        targetPlayer.improvements.push(cardId)
      }
      targetPlayer.playedCards.push(`major:${cardId}`)
    } else if (cardType === 'occupation') {
      if (!targetPlayer.occupationPlayed.includes(cardId)) {
        targetPlayer.occupationPlayed.push(cardId)
      }
      targetPlayer.playedCards.push(`occupation:${cardId}`)
    } else {
      if (!targetPlayer.minorPlayed.includes(cardId)) {
        targetPlayer.minorPlayed.push(cardId)
      }
      targetPlayer.playedCards.push(`minor:${cardId}`)
    }
    updateState(nextState)
    void persistGame(nextState)
  }

  const drawDevCard = () => {
    const cardId = stripCardId(devCardId)
    if (!cardId) return
    const nextState = cloneState(state)
    const targetPlayer = nextState.players.find((player) => player.id === devPlayerId)
    if (!targetPlayer) return
    const isOccupation = occupationIdSet.has(cardId)
    removeCardFromAllHands(cardId, nextState)
    if (isOccupation) {
      if (!targetPlayer.occupationHand.includes(cardId)) {
        targetPlayer.occupationHand.push(cardId)
      }
    } else {
      if (!targetPlayer.minorHand.includes(cardId)) {
        targetPlayer.minorHand.push(cardId)
      }
    }
    updateState(nextState)
    void persistGame(nextState)
  }

  const saveDevState = () => {
    const payload = JSON.stringify(state, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `open-agricola-round-${state.round}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const loadDevState = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (!result) return
      const raw = JSON.parse(String(result)) as GameState
      const nextState = normalizeState(raw)
      setHistory([])
      setViewPlayerId(nextState.players[0]?.id ?? '')
      setDevPlayerId(nextState.players[0]?.id ?? '')
      setShowScoringPad(false)
      setPendingNextPlayerIndex(null)
      setPendingChoice(null)
      setPendingAnimalReorg(null)
      setAnimalReorg(null)
      setActionStartSnapshot(null)
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
      engineRef.current = null
      updateState(nextState)
      void persistGame(nextState)
    }
    reader.readAsText(file)
  }

  const openAnytimeReorg = () => {
    if (pendingChoice || pendingAnimalReorg) return
    const playerIndex = state.currentPlayerIndex
    const player = state.players[playerIndex]
    if (!player) return
    pushHistorySnapshot(state)
    setPendingAnimalReorg({ playerIndex, spaceId: 'anytime-reorg' })
    setAnimalReorg(createAnimalReorgState(player))
  }

  const adjustReorgAnimal = (
    zoneId: string,
    animalType: 'sheep' | 'boar' | 'cattle',
    delta: number,
  ) => {
    if (!reorgAvailable) return
    setAnimalReorg((prev) => {
      if (!prev) return prev
      const capacity = reorgZoneMap.get(zoneId)?.capacity ?? 0
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
      if (delta > 0) {
        const baseTotals = { ...totals }
        if (current.animalType) {
          baseTotals[current.animalType] -= current.animalCount
        }
        const remaining = reorgAvailable[animalType] - baseTotals[animalType]
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

  const confirmAnimalReorg = () => {
    if (!pendingAnimalReorg || !animalReorg || !reorgPlayer) return
    const reorgSource = pendingAnimalReorg.spaceId
    if (hasReorgOverflow) return
    if (reorgUnassignedTotal > 0 && !animalReorg.confirmDiscard) {
      setAnimalReorg({ ...animalReorg, confirmDiscard: true })
      return
    }
    const nextState = cloneState(state)
    const player = nextState.players[pendingAnimalReorg.playerIndex]
    if (!player) return
    applyAnimalReorgToPlayer({
      player,
      animalReorg,
      totals: reorgTotals,
      getPastureCapacity,
    })
    setPendingAnimalReorg(null)
    setAnimalReorg(null)
    const plan = buildPostReorgPlan({
      reorgSource,
      nextState,
      spaceId: pendingAnimalReorg.spaceId,
      hasPendingAnimals,
    })
    if (plan.type === 'anytime') {
      updateState(nextState)
      void persistGame(nextState)
      return
    }
    if (plan.type === 'harvestNextPlayer') {
      const nextPendingPlayer = nextState.players[plan.pendingPlayerIndex]
      if (nextPendingPlayer) {
        setPendingHarvestFinalizeState(nextState)
        setPendingAnimalReorg({
          playerIndex: plan.pendingPlayerIndex,
          spaceId: 'harvest-breed',
        })
        setAnimalReorg(createAnimalReorgState(nextPendingPlayer))
        setViewPlayerId(nextPendingPlayer.id)
        updateState(nextState)
        return
      }
    }
    if (plan.type === 'harvestFinalize') {
      setPendingHarvestFinalizeState(null)
      finalizeRound(nextState)
      return
    }
    if (plan.type !== 'actionSpace') {
      updateState(nextState)
      return
    }
    if (!plan.hasTargetSpace) {
      updateState(nextState)
      return
    }
    const targetSpace = nextState.actionSpaces.find(
      (item) => item.id === pendingAnimalReorg.spaceId,
    )
    if (!targetSpace) {
      updateState(nextState)
      return
    }
    const engine = engineRef.current ?? createEngine(pendingAnimalReorg.spaceId)
    engineRef.current = engine
    const progress = runEngineSteps(
      engine,
      nextState,
      player,
      targetSpace,
      pendingAnimalReorg.playerIndex,
    )
    const progressPlan = buildReorgEngineProgressPlan({
      progress,
      pendingAnimalReorg,
      players: nextState.players,
      currentPlayerIndex: nextState.currentPlayerIndex,
      nextPlayerIndex,
    })
    if (progressPlan.type === 'choice') {
      if (progressPlan.resetFenceSelection) {
        setPendingFenceEdges([])
        setFenceError(null)
      }
      if (progressPlan.resetStableSelection) {
        setPendingStableTiles([])
        setStableError(null)
      }
      setPendingChoice(progressPlan.pendingChoice)
      updateState(nextState)
      return
    }
    if (progressPlan.type === 'fail') {
      targetSpace.takenBy = null
      player.workersAvailable += 1
      nextState.log.unshift({
        key: progressPlan.logKey,
        params: { player: player.name },
      })
      setActionStartSnapshot(null)
      engineRef.current = null
      updateState(nextState)
      return
    }
    if (progressPlan.type === 'reorg') {
      setPendingAnimalReorg({
        playerIndex: progressPlan.playerIndex,
        spaceId: progressPlan.spaceId,
      })
      setAnimalReorg(createAnimalReorgState(player))
      updateState(nextState)
      return
    }
    engineRef.current = null
    setPendingNextPlayerIndex(progressPlan.pendingNextPlayerIndex)
    updateState(nextState)
  }

  const cancelAnimalDiscardPrompt = () => {
    setAnimalReorg((prev) => {
      if (!prev) return prev
      return { ...prev, confirmDiscard: false }
    })
  }

  const isBakeExchange =
    pendingChoice?.promptKey === 'ui.interactionBakeBreadChoice'
  const bakeExchangePlayer =
    isBakeExchange && pendingChoice
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

  const harvestPending = harvestContext?.pending[0] ?? null
  const harvestPlayer = harvestPending
    ? state.players[harvestPending.playerIndex]
    : null
  const harvestRemaining = harvestPending?.remaining ?? 0
  const harvestFeedOptions = useMemo(
    () =>
      harvestPlayer
        ? buildHarvestFeedOptionsCore(harvestPlayer, locale, cardLabel)
        : [],
    [harvestPlayer, locale],
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
    if (!harvestPending || harvestFeedOptionIds.length === 0) {
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
    harvestPending,
    harvestFeedOptionIds,
    harvestFeedKey,
    harvestFeedCounts,
  ])
  const harvestCostTotals = harvestFeedOptions.reduce<Partial<Resource>>(
    (acc, option) => {
      const count = harvestFeedCounts[option.id] ?? 0
      if (count <= 0) return acc
      acc[option.resourceKey] = (acc[option.resourceKey] ?? 0) + count
      return acc
    },
    {},
  )
  const harvestFoodFromConversions = harvestFeedOptions.reduce(
    (sum, option) =>
      sum + (harvestFeedCounts[option.id] ?? 0) * option.food,
    0,
  )
  const harvestRequired = harvestPending
    ? harvestPending.foodUsed + harvestPending.remaining
    : 0
  const harvestFed = Math.min(
    harvestRequired,
    harvestPending ? harvestPending.foodUsed + harvestFoodFromConversions : 0,
  )
  const harvestRemainingAfter = Math.max(
    0,
    harvestRemaining - harvestFoodFromConversions,
  )
  const harvestExtraFood = Math.max(
    0,
    harvestFoodFromConversions - harvestRemaining,
  )
  const harvestSummaryResources = harvestPlayer
    ? formatResources(
        locale,
        {
          ...harvestPlayer.resources,
          food: harvestPlayer.resources.food + harvestExtraFood,
          grain: Math.max(
            0,
            harvestPlayer.resources.grain - (harvestCostTotals.grain ?? 0),
          ),
          vegetable: Math.max(
            0,
            harvestPlayer.resources.vegetable - (harvestCostTotals.vegetable ?? 0),
          ),
          sheep: Math.max(
            0,
            harvestPlayer.resources.sheep - (harvestCostTotals.sheep ?? 0),
          ),
          boar: Math.max(
            0,
            harvestPlayer.resources.boar - (harvestCostTotals.boar ?? 0),
          ),
          cattle: Math.max(
            0,
            harvestPlayer.resources.cattle - (harvestCostTotals.cattle ?? 0),
          ),
          begging: harvestPlayer.resources.begging + harvestRemainingAfter,
        },
        true,
      )
    : ''
  const resetHarvestFeedCounts = () => {
    const nextCounts: Record<string, number> = {}
    harvestFeedOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setHarvestFeedCounts(nextCounts)
  }
  const resetBakeExchangeCounts = () => {
    const nextCounts: Record<string, number> = {}
    bakeExchangeOptionIds.forEach((id) => {
      nextCounts[id] = 0
    })
    setBakeExchangeCounts(nextCounts)
  }

  return (
    <div className="app">
      <InteractionBar
        pendingAnimalReorg={pendingAnimalReorg}
        pendingChoice={pendingChoice}
        pendingNextPlayerIndex={pendingNextPlayerIndex}
        locale={locale}
        pendingRoomTilesLength={pendingRoomTiles.length}
        maxRoomSelections={maxRoomSelections}
        pendingStableTilesLength={pendingStableTiles.length}
        maxStableSelections={maxStableSelections}
        pendingSowSelectionsLength={sowSelectedCount}
        fenceErrorText={fenceErrorText}
        roomErrorText={roomErrorText}
        stableErrorText={stableErrorText}
        plowErrorText={plowErrorText}
        sowErrorText={sowErrorText}
        isSelectingFences={isSelectingFences}
        isSelectingRooms={isSelectingRooms}
        isSelectingStables={isSelectingStables}
        isSelectingPlow={isSelectingPlow}
        isSelectingSow={isSelectingSow}
        resolveChoice={resolveChoice}
        confirmNextPlayer={confirmNextPlayer}
        harvestFeedPlayerName={harvestPending?.playerName ?? null}
        confirmHarvestFeed={confirmHarvestFeed}
      />
      {harvestPending && harvestPlayer ? (
        <div className="exchange-overlay">
          <div className="exchange-modal">
            <div className="exchange-header">
              <div className="exchange-title">
                {t(locale, 'ui.harvestFeedTitle')}
              </div>
              <div className="exchange-subtitle">
                {t(locale, 'ui.harvestFeedSubtitle', {
                  player: harvestPlayer.name,
                  count: harvestRemaining,
                })}
              </div>
              <div className="exchange-subtitle">
                {t(locale, 'ui.harvestFeedProgress', {
                  fed: harvestFed,
                  required: harvestRequired,
                  begging: harvestRemainingAfter,
                })}
              </div>
            </div>
            <div className="exchange-content">
              <div className="exchange-options">
                {harvestFeedOptions.map((option) => {
                  const currentCount = harvestFeedCounts[option.id] ?? 0
                  const usedForResource = harvestFeedOptions.reduce(
                    (sum, item) =>
                      item.resourceKey === option.resourceKey
                        ? sum + (harvestFeedCounts[item.id] ?? 0)
                        : sum,
                    0,
                  )
                  const available = harvestPlayer.resources[option.resourceKey]
                  const remaining = Math.max(
                    0,
                    available - (usedForResource - currentCount),
                  )
                  const limit = currentCount + remaining
                  const canAdd = currentCount < limit
                  const canSubtract = currentCount > 0
                  return (
                    <div key={option.id} className="exchange-row">
                      <div className="exchange-name">{option.sourceName}</div>
                      <div className="exchange-rate">
                        {t(locale, 'ui.harvestFeedRate', {
                          resource: t(locale, `resources.${option.resourceKey}`),
                          food: option.food,
                        })}
                      </div>
                      <div className="exchange-steps">
                        <button
                          type="button"
                          className="exchange-step"
                          onClick={() => updateHarvestSelection(option.id, -1)}
                          disabled={!canSubtract}
                        >
                          -
                        </button>
                        <div className="exchange-count">{currentCount}</div>
                        <button
                          type="button"
                          className="exchange-step"
                          onClick={() => updateHarvestSelection(option.id, 1)}
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
                  {harvestSummaryResources || t(locale, 'ui.noResources')}
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
                    onClick={() => confirmHarvestFeed()}
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
      {showScoringPad ? (
        <ScoringPad
          locale={locale}
          scores={scoreSummaries}
          onClose={() => setShowScoringPad(false)}
        />
      ) : null}
      {devMode ? (
        <DevPanel
          locale={locale}
          players={state.players}
          devPlayerId={devPlayerId}
          devResource={devResource}
          devAmount={devAmount}
          devRound={devRound}
          resourceKeys={resourceKeys}
          setDevPlayerId={setDevPlayerId}
          setDevResource={setDevResource}
          setDevAmount={setDevAmount}
          setDevRound={setDevRound}
          applyDevResource={applyDevResource}
          applyDevRound={applyDevRound}
          devCardId={devCardId}
          setDevCardId={setDevCardId}
          playDevCard={playDevCard}
          drawDevCard={drawDevCard}
          saveDevState={saveDevState}
          loadDevState={loadDevState}
        />
      ) : null}
      <AnytimeBar
        hasAnytimeReorg={hasAnytimeReorg}
        pendingChoice={pendingChoice}
        pendingNextPlayerIndex={pendingNextPlayerIndex}
        pendingAnimalReorg={pendingAnimalReorg}
        locale={locale}
        openAnytimeReorg={openAnytimeReorg}
      />
      <GameHeader
        locale={locale}
        setLocale={setLocale}
        state={state}
        currentPlayer={currentPlayer}
        allWorkersUsed={allWorkersUsed}
        devMode={devMode}
        setDevMode={setDevMode}
      />
      <GameControls
        locale={locale}
        onUndo={undo}
        onUndoAction={undoAction}
        onUndoRound={undoRound}
        onEndRound={endRound}
        onResetGame={resetGame}
        onShowScoring={() => setShowScoringPad(true)}
        historyLength={history.length > 0 ? history.length : actionStartSnapshot ? 1 : 0}
        hasActionStartSnapshot={!!actionStartSnapshot}
        allWorkersUsed={allWorkersUsed}
        isGameOver={state.gameOver}
        devMode={devMode}
        seedValue={resetSeedInput}
        onSeedChange={setResetSeedInput}
      />
      <MajorImprovements
        locale={locale}
        availableMajorImprovements={state.availableMajorImprovements}
        currentPlayer={currentPlayer}
        isSelectingMajor={isSelectingImprovementAny}
        resolveChoice={resolveChoice}
        futureCardResources={futureCardResources}
      />
      <main className="board">
        <ActionBoard
          locale={locale}
          baseActions={baseActions}
          roundSlots={roundSlots}
          currentPlayer={currentPlayer}
          players={state.players}
          futureMeeples={state.futureMeeples}
          canTakeAction={canTakeActionInUI}
          takeAction={takeAction}
          currentRound={state.round}
          devMode={devMode}
        />
        <FarmBoard
          locale={locale}
          players={state.players}
          currentPlayer={currentPlayer}
          displayPlayer={displayPlayer}
          devMode={devMode}
          currentStartPlayerId={
            state.roundStartSnapshot?.players.find((player) => player.startPlayer)
              ?.id ?? state.players.find((player) => player.startPlayer)?.id ?? ''
          }
          nextStartPlayerId={
            state.players.find((player) => player.startPlayer)?.id ?? ''
          }
          playedCards={playedCards}
          farmCells={farmCells}
          roomPositions={roomPositions}
          fieldPositions={fieldPositions}
          fieldMap={fieldMap}
          stablePositions={stablePositions}
          pendingRoomSet={pendingRoomSet}
          pendingStableSet={pendingStableSet}
          canSelectRooms={canSelectRooms}
          canSelectStables={canSelectStables}
          canSelectPlow={canSelectPlow}
          canSelectSow={canSelectSow}
          maxStableSelections={maxStableSelections}
          plowSelectableSet={plowSelectableSet}
          pendingPlowTile={pendingPlowTile}
          pendingSowSelections={pendingSowSelections}
          sowRemaining={sowRemaining}
          pastureTiles={pastureTiles}
          pastureDisplayMap={pastureDisplayMap}
          pastureCapacityMap={pastureCapacityMap}
          houseDisplay={houseDisplay}
          stableDisplayMap={stableDisplayMap}
          isReorgActive={isReorgActive}
          reorgRemaining={reorgRemaining}
          hasReorgOverflow={hasReorgOverflow}
          animalReorg={animalReorg}
          pendingFenceSet={pendingFenceSet}
          existingFenceSet={existingFenceSet}
          canSelectFences={canSelectFences}
          toggleRoomTile={toggleRoomTile}
          toggleStableTile={toggleStableTile}
          togglePlowTile={togglePlowTile}
          updateSowSelection={updateSowSelection}
          toggleFenceEdge={toggleFenceEdge}
          adjustReorgAnimal={adjustReorgAnimal}
          confirmAnimalReorg={confirmAnimalReorg}
          cancelAnimalDiscardPrompt={cancelAnimalDiscardPrompt}
          setViewPlayerId={setViewPlayerId}
          isSelectingMinor={isSelectingMinor}
          isSelectingOccupation={isSelectingOccupation}
          isSelectingImprovementAny={isSelectingImprovementAny}
          futureCardResources={futureCardResources}
          resolveChoice={resolveChoice}
        />
      </main>
      <LogPanel locale={locale} log={state.log} />
    </div>
  )
}
