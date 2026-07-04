import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M048_ForestSwamp'

const cutPeatListener: CardListenerRegistration = {
  id: 'M048-forest-swamp-after-cut-peat',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['cut-peat'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const round = context.state.round + 4
    if (round > 14) return
    return {
      flow: futureMeeplesNode({
        cardId: CARD_ID,
        playerId: context.ownerPlayer?.id ?? context.player.id,
        entries: [{ round, resources: { forest: 1 } }],
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [cutPeatListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M048_ForestSwamp = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Forest Swamp",
    deck: "M",
    number: 48,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time you take the __Cut Peat__ special action, add 4 to the current round and place 1 <FOREST> on the corresponding round space. At the start of that round, you can place the <FOREST> on an unused farmyard space."
    ],
    cost: {},
    prerequisite: "2 Major Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M048_ForestSwamp_impl = M048_ForestSwamp.impl
