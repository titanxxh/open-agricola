import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'D039_TruffleSlicer'
/**
 * D39 Truffle Slicer (Minor Improvement):
 * When player uses a wood accumulation space (forest, copse, grove),
 * if player has pigs (boar > 0), can pay 1 food for 1 bonus score.
 */
const listener: CardListenerRegistration = {
  id: 'D39-truffle-slicer-after-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpaceId(context.space?.id)) return
    if ((context.player.resources.boar ?? 0) <= 0) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 },
          }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 8
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D039_TruffleSlicer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Truffle Slicer',
    deck: 'D',
    number: 39,
    category: 'POINTS_PROVIDER',
    desc: ['Each time you use a wood accumulation space, if you have at least 1 <PIG>, you can pay 1 <FOOD> for 1 bonus <SCORE>.'],
    cost: { wood: 1 },
    prerequisite: 'Play in Round 8 or Later',
    extraVp: true,
  },
  impl: cardImpl,
})

export const D039_TruffleSlicer_impl = D039_TruffleSlicer.impl
