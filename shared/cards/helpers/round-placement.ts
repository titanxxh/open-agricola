import type { GameState, PlayerState, SupplyWorkerSource, WorkerRef } from '../../contract/types'
import { ensureCardState } from './card-state'

const ROUND_PLACEMENT_CARD_ID = '__roundPlacement__'

export type RoundPlacementEntry = { spaceId: string; workerId: string; relocation?: true }
type ReturnHomePlacement = WorkerRef & { spaceId: string; disposition?: SupplyWorkerSource['disposition'] }

const currentPlacements = (state: GameState): ReturnHomePlacement[] =>
  state.actionSpaces.flatMap((space) => space.takenBy.map((worker) => ({
    ...worker,
    spaceId: space.id,
    disposition: state.players.find((player) => player.id === worker.playerId)
      ?.workers.find((entry) => entry.id === worker.workerId)?.supplyUse?.disposition,
  })))

export const recordReturnHomePlacements = (state: GameState): void => {
  const placements = currentPlacements(state)
  for (const player of state.players) {
    const cs = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
    cs.extraData = { ...cs.extraData, returnHomePlacements: placements.filter((entry) => entry.playerId === player.id) }
  }
}

export const getReturnHomePlacements = (state: GameState): ReturnHomePlacement[] => {
  const snapshots = state.players.map((player) =>
    player.cardStates?.[ROUND_PLACEMENT_CARD_ID]?.extraData?.returnHomePlacements as ReturnHomePlacement[] | undefined,
  )
  return snapshots.some((entries) => entries !== undefined)
    ? snapshots.flatMap((entries) => entries ?? []) : currentPlacements(state)
}

export const getRoundPlacementDetails = (player: PlayerState): RoundPlacementEntry[] =>
  (player.cardStates?.[ROUND_PLACEMENT_CARD_ID]?.extraData?.placements as RoundPlacementEntry[] | undefined) ?? []

export const getRoundPlacementOrder = (player: PlayerState): string[] =>
  getRoundPlacementDetails(player).map(e => e.spaceId)

export const getRoundPersonPlacementDetails = (player: PlayerState): RoundPlacementEntry[] =>
  getRoundPlacementDetails(player).filter((entry) => entry.relocation !== true)

export const getRoundPersonPlacementOrder = (player: PlayerState): string[] =>
  getRoundPersonPlacementDetails(player).map(({ spaceId }) => spaceId)

export const recordRoundPlacement = (
  player: PlayerState,
  spaceId: string,
  workerId: string,
  relocation = false,
): void => {
  const cs = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
  const current = getRoundPlacementDetails(player)
  const placement: RoundPlacementEntry = { spaceId, workerId, ...(relocation ? { relocation: true } : {}) }
  cs.extraData = { ...(cs.extraData ?? {}), placements: [...current, placement] }
}

export const resetRoundPlacements = (player: PlayerState): void => {
  const cs = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
  cs.extraData = { ...(cs.extraData ?? {}), placements: [] }
  delete cs.extraData.returnHomePlacements
}
