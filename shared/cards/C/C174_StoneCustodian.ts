import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C174_StoneCustodian'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeReturnHome: (state) => {
      const stoneSpaceCount = state.actionSpaces.filter((space) =>
        (space.gainPerRound.stone ?? 0) > 0 && (space.resources.stone ?? 0) > 0).length
      if (stoneSpaceCount === 0) return
      return gainLeaf(CARD_ID, stoneSpaceCount === 1 ? { grain: 1 } : { vegetable: 1 })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C174_StoneCustodian = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stone Custodian',
    deck: 'C',
    number: 174,
    category: 'CROP_PROVIDER',
    desc: ['At the end of each work phase, if 1 stone accumulation space has stone left, you get 1 grain If 2 stone accumulation spaces have stone left, you get 1 vegetable instead.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C174_StoneCustodian_impl = C174_StoneCustodian.impl
