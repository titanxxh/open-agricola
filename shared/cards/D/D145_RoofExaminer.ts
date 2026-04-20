import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'D145_RoofExaminer'

export const D145_RoofExaminer = new Occupation({
  id: CARD_ID,
  name: 'Roof Examiner',
  deck: 'D',
  number: 145,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, if you have 1/2/3/4 major improvements, you immediately get 2/3/4/5 <REED>.'],
  cost: {},
  players: '3+',
  newSet: true,
})

export const D145_RoofExaminer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    // If you have 1/2/3/4 major improvements, immediately get 2/3/4/5 reed
    const majorCount = collectCardsAs(player, 'major').length
    if (majorCount === 0) return
    const reed = Math.min(majorCount + 1, 5)
    return gainLeaf(CARD_ID, { reed })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
