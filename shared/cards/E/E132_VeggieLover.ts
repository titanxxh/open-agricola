import { defineOccupationCard } from '../card-source'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

const CARD_ID = 'E132_VeggieLover'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      if (player.resources.grain < 1 || player.resources.vegetable < 1) return
      return {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1, vegetable: 1 } }),
          gainLeaf(CARD_ID, { food: 6 }),
        ],
      }
    },
    computeCostedBonus: (_state, player, _ctx) => {
      const grain = player.resources.grain ?? 0
      const veg = player.resources.vegetable ?? 0
      const maxStacks = Math.max(0, Math.min(grain, veg, 3))
      const BONUS_BY_STACKS = [0, 2, 4, 6]
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= maxStacks; k++) {
        levels.push({
          cost: k === 0 ? {} : { grain: k, vegetable: k },
          score: BONUS_BY_STACKS[k] ?? 0,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E132_VeggieLover = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Veggie Lover",
    deck: "E",
    number: 132,
    category: "BONUS_POINTS",
    desc: [
        '[Harvest]',
        '<GRAIN_VEG_STACK> <ARROW-1X> 6<FOOD>',
        '[Scoring]',
        '1/2/3 <GRAIN_VEG_STACK> <ARROW-1X> 2/4/6 <SCORE>',
      ],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const E132_VeggieLover_impl = E132_VeggieLover.impl
