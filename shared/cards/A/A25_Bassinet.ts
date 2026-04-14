import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A25_Bassinet'

/**
 * A25 Bassinet (MinorImprovement, A, 25)
 * Track whether this is the player's first action in a round.
 * Each time you use Family Growth as your first action in a round,
 * you also get 3 food.
 */
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(player, CARD_ID, 'actionsTaken', 0)
  },
})

/**
 * Track actions: increment counter after each place-farmer.
 */
const trackActionsListener: CardListenerRegistration = {
  id: 'A25-bassinet-track-actions',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const current = readCardExtraData<number>(context.player, CARD_ID, 'actionsTaken') ?? 0
    writeCardExtraData(context.player, CARD_ID, 'actionsTaken', current + 1)
  },
}

/**
 * After family growth: if this was the first action in the round, gain 3 food.
 */
const afterFamilyGrowthListener: CardListenerRegistration = {
  id: 'A25-bassinet-after-family-growth',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    // actionsTaken was incremented by the place-farmer listener before this fires.
    // If it's 1, this is the first action in the round.
    const actionsTaken = readCardExtraData<number>(context.player, CARD_ID, 'actionsTaken') ?? 0
    if (actionsTaken > 1) return
    return {
      flow: gainLeaf(CARD_ID, { food: 3 }),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(trackActionsListener)
registerCardListener(afterFamilyGrowthListener)

export const A25_Bassinet = new MinorImprovement({
  id: CARD_ID,
  name: 'Bassinet',
  deck: 'A',
  number: 25,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use __Family Growth__ as your first action in a round, you also get 3 <FOOD>.'],
  cost: {},
  vp: 1,
})
