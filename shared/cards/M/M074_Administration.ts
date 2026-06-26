import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { majorImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M074_Administration'

const realHandCount = (ids: readonly string[]) =>
  ids.filter((id) => !id.startsWith('__')).length

const exchangeFlow = (count: number): ActionFlow => ({
  type: 'seq',
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: count } }),
    ...Array.from({ length: count }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp' as const,
      sourceCard: CARD_ID,
    })),
  ],
})

const cardImpl = {
  prerequisiteCheck: (player) => realHandCount(player.minorHand ?? []) <= 4,
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
    onHarvestFeedingPhase: (state, player) => {
      if (state.round !== 14) return
      const max = Math.min(player.resources.food ?? 0, majorImprovementCount(player))
      if (max <= 0) return
      if (max === 1) {
        return { ...exchangeFlow(1), optional: true }
      }
      return {
        type: 'xor' as const,
        optional: true,
        children: Array.from({ length: max }, (_, index) => exchangeFlow(index + 1)),
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M074_Administration = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Administration",
    deck: "M",
    number: 74,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 2 food. In the harvest at the end of round 14, for each major improvement you have, you can exchange 1 food for 1 bonus point. This card counts as an improvement in hand for its prerequisite."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    extraVp: true,
    prerequisite: "At Most 4 Improvements in Hand",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M074_Administration_impl = M074_Administration.impl
