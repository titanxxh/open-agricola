import { defineMinorCard } from '../card-source'
import { returnCardToBoard } from '../helpers/return-card'
import type { CardImpl } from '../registry'

const CARD_ID = 'D60_LargePottery'

const cardImpl = {
  prerequisiteCheck: (player) =>
    player.improvements.includes('Major_Pottery'),
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (!player.improvements.includes('Major_Pottery')) return
    returnCardToBoard(player, 'Major_Pottery', state)
  },
  computeBonusScore: (_state, player) => {
    // Solver has already subtracted any costed-bonus reservations from
    // playerForBonus.resources, so this read is the post-solve remaining clay.
    const clay = player.resources.clay ?? 0
    if (clay >= 7) return 4
    if (clay >= 6) return 3
    if (clay >= 5) return 2
    if (clay >= 3) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D60_LargePottery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Large Pottery',
    deck: 'D',
    number: 60,
    category: 'FOOD_PROVIDER',
    desc: [
        '[Anytime]',
        '<CLAY> <ARROW> 2<FOOD>',
        '[Scoring]',
        '3/5/6/7<CLAY> <ARROW-1X> 1/2/3/4<SCORE>',
      ],
    cost: { clay: 1, stone: 1 },
    vp: 3,
    extraVp: true,
    prerequisite: 'Return the Pottery',
    potteryIdentity: true,
    alsoCountsAs: ['major'],
    evenMoreSet: true,
    waresSalesmanGains: [{ clay: 1, reed: 1 }],
    exchanges: [
        { from: { clay: 1 }, to: { food: 2 }, triggers: ['anytime'] },
      ],
  },
  impl: cardImpl,
})

export const D60_LargePottery_impl = D60_LargePottery.impl
