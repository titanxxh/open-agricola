import type { PlayerState } from '../../contract/types'
import { ensureCardState } from './card-state'

const ROUND_PLACEMENT_CARD_ID = '__roundPlacement__'

export type RoundPlacementEntry = { spaceId: string; workerId: string; relocation?: true }

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
}
