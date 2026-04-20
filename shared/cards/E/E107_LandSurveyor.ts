import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E107_LandSurveyor'

export const E107_LandSurveyor = new Occupation({
  id: CARD_ID,
  name: "Land Surveyor",
  deck: "E",
  number: 107,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, if you have at least 2/4/6/7 fields, you get 1/2/3/4 <FOOD>."],
  cost: {},
  players: "1+",
})

export const E107_LandSurveyor_impl = {
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
