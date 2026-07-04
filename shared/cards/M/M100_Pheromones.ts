import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { allImprovementCount, hasStableOrPasture } from './moor-batch1-helpers'

const CARD_ID = 'M100_Pheromones'

const foodGainLeaf = (food: number, recipientPlayerId?: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'gain',
  sourceCard: CARD_ID,
  params: {
    food,
    ...(recipientPlayerId ? { recipientPlayerId } : {}),
  },
})

const cardImpl = {
  prerequisiteCheck: (player) => allImprovementCount(player) <= 2,
  effect: {
    id: CARD_ID,
    onBuy: (state, _player) => ({
      type: 'seq' as const,
      children: [
        foodGainLeaf(1),
        ...state.players
          .filter(hasStableOrPasture)
          .map((recipient) => foodGainLeaf(2, recipient.id)),
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M100_Pheromones = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Pheromones",
    deck: "M",
    number: 100,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 <FOOD>. Additionally, each player, including you, with at least 1 <STABLE> or pasture immediately gets 2 <FOOD>."
    ],
    cost: {},
    prerequisite: "At Most 2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M100_Pheromones_impl = M100_Pheromones.impl
