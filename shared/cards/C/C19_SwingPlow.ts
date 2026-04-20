import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C19_SwingPlow'

const listener: CardListenerRegistration = {
  id: 'C19-swing-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'farmland') return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return

    if (stack.length >= 2) {
      // 2+ fields remaining — offer up to 2 plows (nested optional)
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
      // Only 1 field left — offer 1 plow
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

export const C19_SwingPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Swing Plow',
  deck: 'C',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Place 4 field tiles on this card. Each time you use the __Farmland__ action space, you can also plow up to 2 fields from this card.'],
  cost: { wood: 3 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})

export const C19_SwingPlow_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['field', 'field', 'field', 'field'])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
