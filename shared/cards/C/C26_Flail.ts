import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C26_Flail'

/**
 * C26 Flail (Minor Improvement)
 *
 * "When you play this card, you immediately get 2 food. Each time you use
 * the Farmland or Cultivation action space, you can also take a Bake Bread
 * action."
 *
 * BGA: onBuy → gainNode(FOOD => 2); listens to Farmland and Cultivation
 * action-card events; onPlayerPlaceFarmer offers optional EXCHANGE with
 * trigger=BREAD (a Bake Bread action).
 *
 * In open-agricola: onBuy grants 2 food; after place-farmer on
 * farmland/cultivation, offer an optional bake-bread follow-up.
 */

const TRIGGER_SPACES = ['farmland', 'cultivation']

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
})

const listener: CardListenerRegistration = {
  id: 'C26-flail-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !TRIGGER_SPACES.includes(spaceId)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C26_Flail = new MinorImprovement({
  id: CARD_ID,
  name: 'Flail',
  deck: 'C',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you immediately get 2 <FOOD>. Each time you use the __Farmland__ or __Cultivation__ action space, you can also take a __Bake Bread__ action.',
  ],
  cost: { wood: 1 },
})
