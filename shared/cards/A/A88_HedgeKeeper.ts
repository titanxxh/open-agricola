import { Occupation } from '../types'
import type { TradeModifier } from '../../game/types'

/** BGA-style: up to 3× "pay 0 to cover 1 wood" fence units (see `addCost` in bga-agricola A88_HedgeKeeper.php). */
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
    type: 'trade',
    cardId: 'A88_HedgeKeeper',
    appliesTo: ['fencing'],
    from: {},
    to: { wood: 1 },
    max: 3,
  } as TradeModifier,
})
