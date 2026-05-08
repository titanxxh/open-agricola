import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C158_ForestCampaigner } from '../../cards-display/C/C158_ForestCampaigner'
export { C158_ForestCampaigner }

const CARD_ID = C158_ForestCampaigner.id

/**
 * C158 Forest Campaigner (Occupation):
 * Before placing a family member, if there are 8 or more wood on all
 * accumulation spaces combined, you receive 1 food.
 *
 * Accumulation spaces are those with gainPerRound containing wood:
 * forest (3 wood/round), grove (2 wood/round), copse (1 wood/round).
 *
 * The check counts wood resources currently sitting on ALL accumulation
 * spaces (any resource type that accumulates, but we count wood specifically
 * across all spaces that have any gainPerRound).
 */

/** Count total wood sitting on all accumulation spaces */
export const countWoodOnAccumulationSpaces = (state: GameState): number => {
  let totalWood = 0
  for (const space of state.actionSpaces) {
    // An accumulation space is one that has any positive gainPerRound
    const hasAccumulation = Object.values(space.gainPerRound).some(
      (v) => typeof v === 'number' && v > 0,
    )
    if (hasAccumulation) {
      totalWood += space.resources.wood ?? 0
    }
  }
  return totalWood
}

const WOOD_THRESHOLD = 8

const beforePlaceFarmerListener: CardListenerRegistration = {
  id: 'C158-forest-campaigner-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const totalWood = countWoodOnAccumulationSpaces(context.state)
    if (totalWood < WOOD_THRESHOLD) return
    return {
      flow: gainLeaf(CARD_ID, { food: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

export const C158_ForestCampaigner_impl = {
  listeners: [beforePlaceFarmerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
