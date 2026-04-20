import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B37_Grange'

export const B37_Grange = new MinorImprovement({
  id: CARD_ID,
  name: 'Grange',
  deck: 'B',
  number: 37,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 <FOOD>.'],
  cost: {},
  vp: 3,
  prerequisite: '6 Field Tiles and All Animal Types',
})

export const B37_Grange_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
