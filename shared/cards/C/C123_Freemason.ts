import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C123_Freemason'

export const C123_Freemason = new Occupation({
  id: CARD_ID,
  name: 'Freemason',
  deck: 'C',
  number: 123,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['As long as you live in a <CLAY>/<STONE> house with exactly 2 rooms, at the start of each work phase, you get 2 <CLAY>/<STONE>.'],
  cost: {},
  players: '1+',
})

export const C123_Freemason_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount !== 2) return
    if (player.houseType === 'stone') {
      return gainLeaf(CARD_ID, { stone: 2 })
    }
    if (player.houseType === 'clay') {
      return gainLeaf(CARD_ID, { clay: 2 })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
