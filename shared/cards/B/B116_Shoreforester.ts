import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B116_Shoreforester'

export const B116_Shoreforester = new Occupation({
  id: CARD_ID,
  name: 'Shoreforester',
  deck: 'B',
  number: 116,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card and each time 1 <REED> is placed on an empty __Reed Bank__ accumulation space in the preparation phase, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})

export const B116_Shoreforester_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onRoundStart: (state, _player) => {
    const space = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!space) return
    if ((space.resources.reed ?? 0) !== 0) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
