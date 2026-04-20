import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B22_WalkingBoots'

export const B22_WalkingBoots = new MinorImprovement({
  id: CARD_ID,
  name: 'Walking Boots',
  deck: 'B',
  number: 22,
  category: 'ACTION_ENHANCER',
  desc: ['You immediately get 2 <FOOD>. You must immediately place a person from your supply. If you do, in the next returning home phase, you must remove that person from play.'],
  cost: {},
  prerequisite: 'At Most 4 People',
  passing: true,
})

export const B22_WalkingBoots_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
