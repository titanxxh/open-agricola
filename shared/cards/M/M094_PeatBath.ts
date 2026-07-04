import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { countTerrain } from './moor-batch1-helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'M094_PeatBath'

const listener: CardListenerRegistration = {
  id: 'M094-peat-bath-after-infirmary',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'moor-infirmary') return
    const player = context.ownerPlayer ?? context.player
    const count = countTerrain(player, 'moor')
    if (count <= 0) return
    const entries = Array.from({ length: count }, (_, index) => ({
      round: context.state.round + index + 1,
      resources: { food: 1 },
    })).filter((entry) => entry.round <= 14)
    if (entries.length === 0) return
    return {
      flow: futureMeeplesNode({
        cardId: CARD_ID,
        playerId: player.id,
        entries,
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M094_PeatBath = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Bath",
    deck: "M",
    number: 94,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you use the \"Infirmary\" action space, place 1 <FOOD> on as many of the next round spaces as there are <MOOR> visible on your farmyard board. At the start of these rounds, you get the <FOOD>."
    ],
    cost: {
        "wood": 1,
        "clay": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M094_PeatBath_impl = M094_PeatBath.impl
