import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C123_Freemason'

const cardImpl = {
  effect: {
  id: CARD_ID,
  stageEligibility: { onWorkStart: (_state, player) => player.roomTiles.length === 2 && (player.houseType === 'clay' || player.houseType === 'stone') },
  onWorkStart: (_state, player, ctx) => {
    const roomCount = player.roomTiles.length
    if (!ctx?.roundPreparation && (roomCount !== 2)) return
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

export const C123_Freemason = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Freemason',
    deck: 'C',
    number: 123,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['As long as you live in a <CLAY>/<STONE> house with exactly 2 rooms, at the start of each work phase, you get 2 <CLAY>/<STONE>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C123_Freemason_impl = C123_Freemason.impl
