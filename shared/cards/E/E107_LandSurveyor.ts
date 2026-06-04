import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E107_LandSurveyor'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {

    const fieldCount = player.fields.length
    let food = 0
    if (fieldCount >= 7) food = 4
    else if (fieldCount >= 6) food = 3
    else if (fieldCount >= 4) food = 2
    else if (fieldCount >= 2) food = 1

    if (food === 0) return
    return gainLeaf(CARD_ID, { food })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E107_LandSurveyor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Land Surveyor",
    deck: "E",
    number: 107,
    category: "FOOD",
    desc: ["In the field phase of each harvest, if you have at least 2/4/6/7 fields, you get 1/2/3/4 <FOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const E107_LandSurveyor_impl = E107_LandSurveyor.impl
