import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A145_Ropemaker'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (_state, _player) => {
    return gainLeaf(CARD_ID, { reed: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A145_Ropemaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Ropemaker",
    deck: "A",
    number: 145,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["At the end of each harvest, you get 1 <REED> from the general supply."],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const A145_Ropemaker_impl = A145_Ropemaker.impl
