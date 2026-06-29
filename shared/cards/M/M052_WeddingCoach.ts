import { defineMinorCard } from '../card-source'
import { hasInactiveWorkerInSupply } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'M052_WeddingCoach'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      if (!hasInactiveWorkerInSupply(player)) return
      return {
        type: 'seq',
        optional: true,
        children: [{
          type: 'leaf',
          actionId: 'family-growth',
          sourceCard: CARD_ID,
          actionContext: {
            skipRoomCheck: true,
            holdNewbornOnCard: CARD_ID,
          },
        }],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M052_WeddingCoach = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wedding Coach",
    deck: "M",
    number: 52,
    category: "ACTIONS_BOOSTER",
    desc: [
        "When you play this card, you can immediately take a \"Family Growth without Room\" action without placing a person. Place the newborn on this card until the returning home phase."
    ],
    cost: {
        "wood": 2,
        "food": 1
    },
    prerequisite: "4 Horses",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M052_WeddingCoach_impl = M052_WeddingCoach.impl
