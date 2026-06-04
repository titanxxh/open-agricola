import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B117_Informant'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onBeforeReturnHome: (_state, player) => {
    if (player.resources.stone <= player.resources.clay) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B117_Informant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Informant',
    deck: 'B',
    number: 117,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <WOOD>. After each work phase, if you have more <STONE> than <CLAY> in your supply, you get 1 <WOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B117_Informant_impl = B117_Informant.impl
