import { useCallback, useEffect, useMemo } from 'react'
import type {
  FarmTilePosition,
  InteractionFarmSelection,
  InteractionSelection,
  PlayerState,
} from '../../shared/contract/types'
import type { Locale } from '../../shared/i18n'
import { t } from '../../shared/i18n'
import { isFarmyardBorderEdge, positionKey } from '../../shared/domain/farm'
import type { PendingSowCrop } from '../types/ui'
import { useFarmSelection } from '../hooks/useFarmSelection'
import { farmCommitErrorMessageKey, type FarmCommitType } from './game-container-helpers'
import type { InteractionPresentationPlan, InteractionSubmitDraft } from './interaction-presentation'

type FenceSubmitError = {
  code: string
  edges: string[]
  newEdges: string[]
}

export type FarmSelectionSubmitDraft = Omit<
  InteractionSubmitDraft,
  | 'value'
  | 'animalReorgZones'
  | 'feedSelections'
  | 'heatingPayment'
  | 'occupationCardIds'
  | 'resourceCounts'
  | 'resourceBatchExchange'
>

export type FarmSelectionDraftPresentationInput = {
  interactionPresentationPlan: InteractionPresentationPlan
  locale: Locale
  displayPlayer?: (Pick<PlayerState, 'resources'> & Partial<Pick<PlayerState, 'farmyardExtensions'>>) | null
  players?: readonly Pick<PlayerState, 'id' | 'name' | 'color'>[]
}

export type FarmSelectionDraftPresentation = ReturnType<typeof useFarmSelectionDraftPresentation>

const farmInteractionFromPlan = (
  plan: InteractionPresentationPlan,
): InteractionFarmSelection | null =>
  plan.kind === 'farm-fence-selection' ||
  plan.kind === 'farm-room-selection' ||
  plan.kind === 'farm-stable-selection' ||
  plan.kind === 'farm-plow-selection' ||
  plan.kind === 'farm-sow-selection'
    ? plan.farm
    : null

const selectionInteractionFromPlan = (
  plan: InteractionPresentationPlan,
): InteractionSelection | null =>
  plan.kind === 'position-selection' || plan.kind === 'occupation-hand-selection'
    ? plan.selection
    : null

const groupKeysForSow = (farmInteraction: InteractionFarmSelection | null) => {
  const map = new Map<string, string | undefined>()
  if (farmInteraction?.farmType === 'sow') {
    farmInteraction.selectableFields.forEach((entry) => {
      map.set(positionKey(entry.tile), entry.groupKey)
    })
  }
  return map
}

const cropCount = (
  selections: Record<string, PendingSowCrop>,
  crop: PendingSowCrop,
) => Object.values(selections).filter((value) => value === crop).length

export const useFarmSelectionDraftPresentation = ({
  interactionPresentationPlan,
  locale,
  displayPlayer,
  players = [],
}: FarmSelectionDraftPresentationInput) => {
  const farmDraft = useFarmSelection()
  const {
    fencePlacementMode,
    setFencePlacementMode,
    setFenceError,
    setPendingFarmHand,
    setPendingFenceEdges,
    setPendingFenceSources,
    setPendingPalisadeEdges,
    setPendingPlowTile,
    setPendingPositionSelections,
    setPendingRoomTiles,
    setPendingSowSelections,
    setPendingStableTiles,
    setPlowError,
    setRoomError,
    setSelectedFenceSourcePlayerId,
    setSowError,
    setStableError,
  } = farmDraft
  const farmInteraction = farmInteractionFromPlan(interactionPresentationPlan)
  const selectionInteraction = selectionInteractionFromPlan(interactionPresentationPlan)
  const borrowedFenceSource =
    farmInteraction?.farmType === 'fence' ? farmInteraction.fenceSource : undefined
  const isBorrowedFenceSelection = borrowedFenceSource?.kind === 'borrowed'

  useEffect(() => {
    if (isBorrowedFenceSelection && fencePlacementMode === 'palisade') {
      setFencePlacementMode('fence')
    }
  }, [fencePlacementMode, isBorrowedFenceSelection, setFencePlacementMode])

  const maxRoomSelections =
    farmInteraction?.farmType === 'room' ? farmInteraction.maxSelections : 0
  const maxStableSelections =
    farmInteraction?.farmType === 'stable' ? farmInteraction.maxSelections : 0
  const maxSowSelections =
    farmInteraction?.farmType === 'sow' ? farmInteraction.maxSelections : undefined
  const maxPositionSelections =
    selectionInteraction?.kind === 'farm-position'
      ? selectionInteraction.maxSelections
      : 0
  const groupKeyByTile = useMemo(
    () => groupKeysForSow(farmInteraction),
    [farmInteraction],
  )

  const pendingFenceSet = useMemo(
    () => new Set(farmDraft.pendingFenceEdges),
    [farmDraft.pendingFenceEdges],
  )
  const pendingPalisadeSet = useMemo(
    () => new Set(farmDraft.pendingPalisadeEdges),
    [farmDraft.pendingPalisadeEdges],
  )
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
    grain: Math.max(0, (displayPlayer?.resources.grain ?? 0) - cropCount(farmDraft.pendingSowSelections, 'grain')),
    vegetable: Math.max(0, (displayPlayer?.resources.vegetable ?? 0) - cropCount(farmDraft.pendingSowSelections, 'vegetable')),
    wood: Math.max(0, (displayPlayer?.resources.wood ?? 0) - cropCount(farmDraft.pendingSowSelections, 'wood')),
    stone: Math.max(0, (displayPlayer?.resources.stone ?? 0) - cropCount(farmDraft.pendingSowSelections, 'stone')),
  }), [displayPlayer?.resources, farmDraft.pendingSowSelections])

  const submitDraft = useMemo<FarmSelectionSubmitDraft>(() => ({
    positionSelectionKeys: [...farmDraft.pendingPositionSelections],
    fenceEdges: farmDraft.pendingFenceEdges,
    palisadeEdges: farmDraft.pendingPalisadeEdges,
    fenceSources: farmDraft.pendingFenceSources,
    roomTiles: farmDraft.pendingRoomTiles,
    stableTiles: farmDraft.pendingStableTiles,
    farmHand: farmDraft.pendingFarmHand,
    plowTile: farmDraft.pendingPlowTile,
    sowSelections: farmDraft.pendingSowSelections,
  }), [
    farmDraft.pendingFenceEdges,
    farmDraft.pendingFenceSources,
    farmDraft.pendingFarmHand,
    farmDraft.pendingPalisadeEdges,
    farmDraft.pendingPlowTile,
    farmDraft.pendingPositionSelections,
    farmDraft.pendingRoomTiles,
    farmDraft.pendingSowSelections,
    farmDraft.pendingStableTiles,
  ])

  const projectionDraft = useMemo(() => ({
    pendingRoomTiles: farmDraft.pendingRoomTiles,
    pendingStableTiles: farmDraft.pendingStableTiles,
    pendingFarmHand: farmDraft.pendingFarmHand,
  }), [farmDraft.pendingFarmHand, farmDraft.pendingRoomTiles, farmDraft.pendingStableTiles])

  const farmBoardDraft = useMemo(() => ({
    maxStableSelections,
    plowSelectableSet,
    pendingPlowTile: farmDraft.pendingPlowTile,
    pendingPositionSelections: farmDraft.pendingPositionSelections,
    pendingSowSelections: farmDraft.pendingSowSelections,
    sowRemaining,
    pendingFenceSet,
    pendingFenceSourceMap: isBorrowedFenceSelection ? farmDraft.pendingFenceSources : undefined,
    pendingPalisadeSet,
    fencePlacementMode: isBorrowedFenceSelection ? 'fence' as const : farmDraft.fencePlacementMode,
  }), [
    farmDraft.fencePlacementMode,
    farmDraft.pendingFenceSources,
    farmDraft.pendingPlowTile,
    farmDraft.pendingPositionSelections,
    farmDraft.pendingSowSelections,
    isBorrowedFenceSelection,
    maxStableSelections,
    pendingFenceSet,
    pendingPalisadeSet,
    plowSelectableSet,
    sowRemaining,
  ])

  const fenceErrorText: string | null = farmDraft.fenceError
    ? t(locale, `fence.error.${farmDraft.fenceError.code}`)
    : null
  const roomErrorText: string | null = farmDraft.roomError
    ? t(locale, farmCommitErrorMessageKey('room', farmDraft.roomError))
    : null
  const stableErrorText: string | null = farmDraft.stableError
    ? t(locale, farmCommitErrorMessageKey('stable', farmDraft.stableError))
    : null
  const plowErrorText: string | null = farmDraft.plowError
    ? t(locale, farmCommitErrorMessageKey('plow', farmDraft.plowError))
    : null
  const sowErrorText: string | null = farmDraft.sowError
    ? t(locale, farmCommitErrorMessageKey('sow', farmDraft.sowError))
    : null

  const interactionBarDraft = useMemo(() => ({
    pendingRoomTilesLength: farmDraft.pendingRoomTiles.length,
    maxRoomSelections,
    pendingFenceEdgesLength: farmDraft.pendingFenceEdges.length + farmDraft.pendingPalisadeEdges.length,
    pendingStableTilesLength: farmDraft.pendingStableTiles.length,
    maxStableSelections,
    pendingFarmHandSelected: farmDraft.pendingFarmHand !== null,
    pendingSowSelectionsLength: Object.keys(farmDraft.pendingSowSelections).length,
    hasPendingPlowSelection: farmDraft.pendingPlowTile !== null,
    pendingPositionSelectionsLength: farmDraft.pendingPositionSelections.size,
    maxPositionSelections,
    fenceErrorText,
    roomErrorText,
    stableErrorText,
    plowErrorText,
    sowErrorText,
    fencePlacementMode: farmDraft.fencePlacementMode,
  }), [
    farmDraft.fencePlacementMode,
    farmDraft.pendingFarmHand,
    farmDraft.pendingFenceEdges,
    farmDraft.pendingPalisadeEdges,
    farmDraft.pendingPlowTile,
    farmDraft.pendingPositionSelections,
    farmDraft.pendingRoomTiles,
    farmDraft.pendingSowSelections,
    farmDraft.pendingStableTiles,
    fenceErrorText,
    maxPositionSelections,
    maxRoomSelections,
    maxStableSelections,
    plowErrorText,
    roomErrorText,
    sowErrorText,
    stableErrorText,
  ])

  const borrowedFenceSources = useMemo(() => {
    if (!isBorrowedFenceSelection || !borrowedFenceSource) return undefined
    return {
      donors: Object.entries(borrowedFenceSource.donorCaps).map(([playerId, cap]) => {
        const donor = players.find((player) => player.id === playerId)
        return {
          playerId,
          name: donor?.name ?? playerId,
          color: donor?.color ?? 'black',
          cap,
          allocated: Object.values(farmDraft.pendingFenceSources).filter((id) => id === playerId).length,
        }
      }),
      selectedPlayerId: farmDraft.selectedFenceSourcePlayerId,
      onSelect: farmDraft.setSelectedFenceSourcePlayerId,
      hasMissingSources: farmDraft.pendingFenceEdges.some((edgeId) => !farmDraft.pendingFenceSources[edgeId]),
    }
  }, [
    borrowedFenceSource,
    farmDraft.pendingFenceEdges,
    farmDraft.pendingFenceSources,
    farmDraft.selectedFenceSourcePlayerId,
    farmDraft.setSelectedFenceSourcePlayerId,
    isBorrowedFenceSelection,
    players,
  ])

  const setCommitError = useCallback((farmType: FarmCommitType, error?: string) => {
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

  const setSubmitError = useCallback((
    farmType: FarmCommitType,
    error: string | FenceSubmitError,
  ) => {
    if (farmType === 'fence' && typeof error !== 'string') {
      setFenceError(error)
      return
    }
    setCommitError(farmType, typeof error === 'string' ? error : error.code)
  }, [setCommitError, setFenceError])

  const reset = useCallback(() => {
    setPendingFenceEdges([])
    setPendingPalisadeEdges([])
    setPendingFenceSources({})
    setSelectedFenceSourcePlayerId(null)
    setFenceError(null)
    setPendingRoomTiles([])
    setRoomError(null)
    setPendingStableTiles([])
    setPendingFarmHand(null)
    setStableError(null)
    setPendingPlowTile(null)
    setPlowError(null)
    setPendingSowSelections({})
    setSowError(null)
    setPendingPositionSelections(new Set())
  }, [
    setFenceError,
    setPendingFarmHand,
    setPendingFenceEdges,
    setPendingFenceSources,
    setPendingPalisadeEdges,
    setPendingPlowTile,
    setPendingPositionSelections,
    setPendingRoomTiles,
    setPendingSowSelections,
    setPendingStableTiles,
    setPlowError,
    setRoomError,
    setSelectedFenceSourcePlayerId,
    setSowError,
    setStableError,
  ])

  const controls = useMemo(() => ({
    toggleFenceEdge: (edgeId: string) =>
      farmDraft.toggleFenceEdge(
        edgeId,
        isBorrowedFenceSelection && borrowedFenceSource
          ? {
              donorCaps: borrowedFenceSource.donorCaps,
              isBorderEdge: (candidate) => isFarmyardBorderEdge(displayPlayer ?? undefined, candidate),
            }
          : { isBorderEdge: (candidate) => isFarmyardBorderEdge(displayPlayer ?? undefined, candidate) },
      ),
    setSelectedFenceSourcePlayerId: farmDraft.setSelectedFenceSourcePlayerId,
    setFencePlacementMode: farmDraft.setFencePlacementMode,
    toggleRoomTile: (tile: FarmTilePosition) =>
      farmDraft.toggleRoomTile(tile, maxRoomSelections, positionKey),
    toggleStableTile: (tile: FarmTilePosition) =>
      farmDraft.toggleStableTile(tile, maxStableSelections, positionKey),
    toggleFarmHand: (tile: FarmTilePosition) =>
      farmDraft.toggleFarmHand(tile, positionKey),
    togglePlowTile: (tile: FarmTilePosition) =>
      farmDraft.togglePlowTile(tile, positionKey),
    updateSowSelection: (tile: FarmTilePosition, value: string) =>
      farmDraft.updateSowSelection(tile, value, maxSowSelections, positionKey, groupKeyByTile),
    togglePositionSelection: (tile: FarmTilePosition) =>
      farmDraft.togglePositionSelection(tile, maxPositionSelections, positionKey),
  }), [
    borrowedFenceSource,
    displayPlayer,
    farmDraft,
    groupKeyByTile,
    isBorrowedFenceSelection,
    maxPositionSelections,
    maxRoomSelections,
    maxSowSelections,
    maxStableSelections,
  ])

  return {
    farmInteraction,
    selectionInteraction,
    occupationHandInteraction:
      selectionInteraction?.kind === 'occupation-hand' ? selectionInteraction : null,
    isBorrowedFenceSelection,
    submitDraft,
    projectionDraft,
    farmBoardDraft,
    interactionBarDraft,
    borrowedFenceSources,
    controls,
    setCommitError,
    setSubmitError,
    reset,
  }
}
