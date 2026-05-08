import type { PlayerState } from '../../contract/types'
import { ensureCardState } from './card-state'

const ROUND_PLACEMENT_CARD_ID = '__roundPlacement__'

export type RoundPlacementEntry = { spaceId: string; workerId: string }

export const getRoundPlacementDetails = (player: PlayerState): RoundPlacementEntry[] =>
  (player.cardStates?.[ROUND_PLACEMENT_CARD_ID]?.extraData?.placements as RoundPlacementEntry[] | undefined) ?? []

export const getRoundPlacementOrder = (player: PlayerState): string[] =>
  getRoundPlacementDetails(player).map(e => e.spaceId)

export const recordRoundPlacement = (
  player: PlayerState,
  spaceId: string,
  workerId: string,
): void => {
  const cs = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
  const current = getRoundPlacementDetails(player)
  cs.extraData = { ...(cs.extraData ?? {}), placements: [...current, { spaceId, workerId }] }
}

export const resetRoundPlacements = (player: PlayerState): void => {
  const cs = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
  cs.extraData = { ...(cs.extraData ?? {}), placements: [] }
}
