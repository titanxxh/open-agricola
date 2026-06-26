import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { BonusScoreLevel } from '../card-effects'
import type { CardImpl } from '../registry'

const CARD_ID = 'Major_Moor_PeatCharcoalKiln'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, player) => {
      const fuel = player.resources.fuel ?? 0
      const levels: BonusScoreLevel[] = [{ cost: {}, score: 0 }]
      if (fuel >= 3) levels.push({ cost: { fuel: 3 }, score: 1 })
      if (fuel >= 5) levels.push({ cost: { fuel: 5 }, score: 2 })
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const Major_Moor_PeatCharcoalKiln = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Peat-charcoal Kiln',
    deck: 'major',
    number: 105,
    category: 'GOODS_PROVIDER',
    cost: { stone: 1 },
    vp: 1,
    extraVp: true,
    requiresFarmersOfTheMoor: true,
    moorSpecialActionBonuses: [
      { actionId: 'cut-peat', resource: 'fuel', amount: 1, horseAmount: 2 },
    ],
    desc: [
      '[Special action: Cut Peat]',
      '+1<FUEL> if you have 0 horses; +2<FUEL> if you have at least 1 horse.',
      '[Scoring]',
      '3/5<FUEL> <ARROW-1X> 1/2<SCORE>',
    ],
  } satisfies CardSourceMetaInput,
  impl: cardImpl,
})
