import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M077_DryingField'

const listener: CardListenerRegistration = {
  id: 'M077-drying-field-after-cut-peat',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['cut-peat'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const round = context.state.round + 3
    if (round > 14) return
    return {
      flow: futureMeeplesNode({
        cardId: CARD_ID,
        playerId: context.ownerPlayer?.id ?? context.player.id,
        entries: [{ round, resources: { fuel: 2 } }],
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M077_DryingField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Drying Field",
    deck: "M",
    number: 77,
    category: "GOODS_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, add 3 to the current round and place 2 fuel on the corresponding round space. At the start of that round, you get the fuel."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M077_DryingField_impl = M077_DryingField.impl
