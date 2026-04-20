import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D39_TruffleSlicer'

/**
 * D39 Truffle Slicer (Minor Improvement):
 * When player uses a wood accumulation space (forest, copse, grove),
 * if player has pigs (boar > 0), can pay 1 food for 1 bonus score.
 */
const WOOD_SPACES = new Set(['forest', 'copse', 'grove'])

const listener: CardListenerRegistration = {
  id: 'D39-truffle-slicer-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !WOOD_SPACES.has(context.space.id)) return
    if ((context.player.resources.boar ?? 0) <= 0) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 },
            choiceLabelKey: 'ui.interactionResourceExchange',
            choiceLabelParams: { resourcesPaid: { food: 1 }, bonusVp: 1 },
          }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D39_TruffleSlicer = new MinorImprovement({
  id: CARD_ID,
  name: 'Truffle Slicer',
  deck: 'D',
  number: 39,
  category: 'BONUS_POINTS',
  desc: ['Each time you use a wood accumulation space, if you have at least 1 <PIG>, you can pay 1 <FOOD> for 1 bonus <SCORE>.'],
  cost: {},
})

export const D39_TruffleSlicer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
