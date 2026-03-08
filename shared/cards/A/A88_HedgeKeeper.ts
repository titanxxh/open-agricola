import { Occupation } from '../types'
import type { BonusModifier } from '../../game/types'

export const A88_HedgeKeeper = new Occupation({
  id: "A88_HedgeKeeper",
  name: "Hedge Keeper",
  deck: "A",
  number: 88,
  category: "FARM_PLANNER",
  desc: ["Each time you take a __Build Fences__ action, you do not have to pay <WOOD> for 3 of the fences you build."],
  cost: {},
  players: "1+",
  modifier: {
    type: 'bonus',
    cardId: 'A88_HedgeKeeper',
    appliesTo: ['fencing'],
    discount: { wood: 3 },
  } as BonusModifier,
})
