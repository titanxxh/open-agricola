import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'

const CARD_ID = 'B19_MoldboardPlow'

/**
 * Place 2 field tiles on this card. Twice this game, when you use the
 * Farmland action space, you can also plow 1 field from this card.
 *
 * Stack items are 'field' tokens (not real resources). pop-card-stack
 * will add a harmless { field: 1 } to resources, but correctly decrements
 * the stack so the card tracks remaining uses.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['field', 'field'])
  },
})

const listener: CardListenerRegistration = {
  id: 'B19-moldboard-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'farmland') return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B19_MoldboardPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Moldboard Plow',
  deck: 'B',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Place 2 field tiles on this card. Twice this game, when you use the __Farmland__ action space, you can also plow 1 field from this card.'],
  cost: { wood: 2 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
