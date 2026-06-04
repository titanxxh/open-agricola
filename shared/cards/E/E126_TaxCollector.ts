import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E126_TaxCollector'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'xor',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 2 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { clay: 2 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E126_TaxCollector = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Tax Collector',
    deck: 'E',
    number: 126,
    category: 'BUILDING_RESOURCES_-_ALL',
    desc: ['Once you live in a stone house, at the start of each round, you get your choice of 2 <WOOD>, 2 <CLAY>, 1 <REED>, or 1 <STONE>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E126_TaxCollector_impl = E126_TaxCollector.impl
