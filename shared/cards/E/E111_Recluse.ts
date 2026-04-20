import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E111_Recluse'

export const E111_Recluse = new Occupation({
  id: CARD_ID,
  name: 'Recluse',
  deck: 'E',
  number: 111,
  category: 'FOOD',
  desc: [
    'As long as you have no minor improvements in front of you, you get 1 <FOOD> at the start of each round and 1 <WOOD> at the start of each harvest.',
  ],
  cost: {},
  players: '1+',
})

export const E111_Recluse_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.minorPlayed.length > 0) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
  onStartHarvest: (_state, player) => {
    if (player.minorPlayed.length > 0) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
