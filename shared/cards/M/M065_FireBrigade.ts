import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { countTerrain } from './moor-batch1-helpers'

const CARD_ID = 'M065_FireBrigade'

const bonusVpLeaves = (amount: number) =>
  Array.from({ length: amount }, () => ({
    type: 'leaf' as const,
    actionId: 'bonus-vp',
    sourceCard: CARD_ID,
  }))

const cardImpl = {
  prerequisiteCheck: (player) =>
    (player.resources.food ?? 0) >= 4 && (player.resources.fuel ?? 0) >= 4,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const bonus = Math.max(0, Math.min(4, countTerrain(player, 'forest') - 1))
      return {
        type: 'seq' as const,
        children: [
          gainLeaf(CARD_ID, { food: 2 }),
          ...bonusVpLeaves(bonus),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M065_FireBrigade = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fire Brigade",
    deck: "M",
    number: 65,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 food. Additionally, if there are forests on at least 2/3/4/5 of your farmyard spaces, you immediately get 1/2/3/4 bonus points. Crops and wood do not count but you can exchange them."
    ],
    cost: {
        "clay": 1,
        "stone": 1
    },
    extraVp: true,
    prerequisite: "4 Food and 4 Fuel",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M065_FireBrigade_impl = M065_FireBrigade.impl
