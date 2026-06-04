import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E61_RaisedBed'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 4 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E61_RaisedBed = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Raised Bed",
    deck: "E",
    number: 61,
    category: "FOOD_-_GRAIN",
    desc: ["At the start of each harvest, you get 4 <FOOD>."],
    vp: 1,
    cost: { clay: 2, stone: 2 },
    prerequisite: "2 Grain Fields",
  },
  impl: cardImpl,
})

export const E61_RaisedBed_impl = E61_RaisedBed.impl
