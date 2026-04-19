import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'

const CARD_ID = 'D20_TurnwrestPlow'

const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

/**
 * Place 2 field tiles on this card. Each time you use Farmland or Cultivation,
 * you can plow up to 2 fields from this card.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['field', 'field'])
  },
})

const listener: CardListenerRegistration = {
  id: 'D20-turnwrest-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return

    if (stack.length >= 2) {
      // 2 fields remaining — offer up to 2 plows
      return {
        flow: {
          type: 'seq',
          optional: true,
          children: [
            { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
            {
              type: 'seq',
              optional: true,
              children: [
                { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
                { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              ],
            },
          ],
        },
        sourceCard: CARD_ID,
      }
    } else {
      // 1 field remaining — offer 1 plow
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
    }
  },
}

registerCardListener(listener)

export const D20_TurnwrestPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Turnwrest Plow',
  deck: 'D',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Place 2 field tiles on this card. Each time you use the __Farmland__ or __Cultivation__ action space, you can also plow up to 2 fields from this card.'],
  cost: { wood: 3 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
