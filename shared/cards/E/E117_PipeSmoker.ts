import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'E117_PipeSmoker'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {

    const grainFieldCount = getLogicalFields(player).filter(
      (field) => field.stacks.some((stack) => stack.kind === 'grain'),
    ).length
    if (grainFieldCount < 1) return

    return gainLeaf(CARD_ID, { wood: 2 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E117_PipeSmoker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Pipe Smoker",
    deck: "E",
    number: 117,
    category: "BUILDING_RESOURCES_-_WOOD",
    desc: ['At the start of each harvest, if you have at least 1 <GRAIN> <FIELD>, you get 2 <WOOD>.'],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const E117_PipeSmoker_impl = E117_PipeSmoker.impl
