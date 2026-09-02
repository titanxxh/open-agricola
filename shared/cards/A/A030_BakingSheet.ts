import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'A030_BakingSheet'
const listener: CardListenerRegistration = {
  id: 'A30-baking-sheet-after-bake',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

const cardImpl = {
  listeners: [listener],
  prerequisiteCheck: (player) => getLogicalFields(player)
    .every((field) => field.stacks.every((stack) => stack.kind !== 'grain')),
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A030_BakingSheet = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Baking Sheet',
    deck: 'A',
    number: 30,
    category: 'POINTS_PROVIDER',
    desc: ['Each time you take a __Bake Bread__ action, you can use this card to exchange exactly 1 <GRAIN> for 2 <FOOD> and 1 bonus <SCORE>.'],
    cost: {},
    prerequisite: 'No Grain Field',
    extraVp: true,
  },
  impl: cardImpl,
})

export const A030_BakingSheet_impl = A030_BakingSheet.impl
