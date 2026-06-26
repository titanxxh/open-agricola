import { defineMinorCard } from '../card-source'
import type { TradeModifier } from '../../contract/types'
import type { CardImpl } from '../registry'
import { countTerrain } from './moor-batch1-helpers'

const CARD_ID = 'M036_PeatMoss'

const cardImpl = {
  modifiers: [{
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['construct'],
    from: {},
    to: { wood: 2, reed: 1 },
    scope: 'unit',
    conditions: { houseTypeWood: 1 },
  } as TradeModifier],
  prerequisiteCheck: (player) => countTerrain(player, 'moor') === 0,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M036_PeatMoss = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Moss",
    deck: "M",
    number: 36,
    category: "FARM_PLANNER",
    desc: [
        "Wooden rooms only cost you 3 <WOOD> and 1 <REED> each."
    ],
    cost: {},
    prerequisite: "No Moors",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M036_PeatMoss_impl = M036_PeatMoss.impl
