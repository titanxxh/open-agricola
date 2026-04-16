import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'C112_Thresher'

/**
 * C112 Thresher — Occupation
 *
 * Before using Grain Utilization, Farmland, or Cultivation, you can
 * optionally exchange 1 grain for 1 food.
 *
 * BGA: onPlayerBeforePlaceFarmer — on Grain Utilization / Farmland / Cultivation,
 * offer optional exchange: pay 1 grain → get 1 food.
 * Also has isDoable modifier to make grain-utilization doable if player has grain
 * (since they could exchange grain for food, even if they can't sow/bake).
 *
 * Implementation: 'before' listener on the 3 trigger space IDs directly.
 * The game-session's before-listener context uses actionId = spaceId,
 * so we register actions matching the space IDs.
 * Returns an optional pay-gain flow (pay 1 grain, gain 1 food).
 * Players: 1+.
 */
const TRIGGER_SPACE_IDS = ['grain-utilization', 'farmland', 'cultivation']

const beforeListener: CardListenerRegistration = {
  id: 'C112-thresher-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: TRIGGER_SPACE_IDS,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if ((context.player.resources.grain ?? 0) < 1) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 1 },
    })
  },
}

registerCardListener(beforeListener)

export const C112_Thresher = new Occupation({
  id: CARD_ID,
  name: 'Thresher',
  deck: 'C',
  number: 112,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time before you use the __Grain Utilization__, __Farmland__, or __Cultivation__ action space, you can exchange 1 <GRAIN> for 1 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
