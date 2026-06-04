import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A30_BakingSheet'
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
  prerequisiteCheck: (player) => player.fields.every((f) => !fieldHasCrop(f, 'grain')),
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A30_BakingSheet = defineMinorCard({
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

export const A30_BakingSheet_impl = A30_BakingSheet.impl
