import type { PlayerState } from '../../game/types'
import { ensureCardState } from './card-state'

const ROUND_PLACEMENT_CARD_ID = '__roundPlacement__'
const ROUND_PLACEMENT_KEY = 'spaces'

export const getRoundPlacementOrder = (player: PlayerState): string[] =>
  (player.cardStates?.[ROUND_PLACEMENT_CARD_ID]?.extraData?.[ROUND_PLACEMENT_KEY] as string[] | undefined)
    ?? []

export const recordRoundPlacement = (
  player: PlayerState,
  spaceId: string,
) => {
  const cardState = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
  const current = getRoundPlacementOrder(player)
  cardState.extraData = {
    ...(cardState.extraData ?? {}),
    [ROUND_PLACEMENT_KEY]: [...current, spaceId],
  }
}

export const resetRoundPlacements = (player: PlayerState) => {
  const cardState = ensureCardState(player, ROUND_PLACEMENT_CARD_ID)
  cardState.extraData = {
    ...(cardState.extraData ?? {}),
    [ROUND_PLACEMENT_KEY]: [],
  }
}
