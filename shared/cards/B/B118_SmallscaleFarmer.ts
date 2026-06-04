import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B118_SmallscaleFarmer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount !== 2) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B118_SmallscaleFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Small-scale Farmer',
    deck: 'B',
    number: 118,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['As long as you live in a house with exactly 2 rooms, at the start of each round, you get 1 <WOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B118_SmallscaleFarmer_impl = B118_SmallscaleFarmer.impl
