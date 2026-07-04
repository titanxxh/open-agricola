import { defineOccupationCard } from '../card-source'
import type { TradeModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

/** BGA-style: up to 3× "pay 0 to cover 1 wood" fence units (see `addCost` in bga-agricola A088_HedgeKeeper.php). */

export const A088_HedgeKeeper = defineOccupationCard({
  meta: {
    id: "A088_HedgeKeeper",
    name: "Hedge Keeper",
    deck: "A",
    number: 88,
    category: "FARM_PLANNER",
    desc: ["Each time you take a __Build Fences__ action, you do not have to pay <WOOD> for 3 of the <FENCE> you build."],
    cost: {},
    players: "1+",
  },
  impl: {
  modifiers: [{
        type: 'trade',
        cardId: 'A088_HedgeKeeper',
        appliesTo: ['fencing'],
        from: {},
        to: { wood: 1 },
        max: 3,
      } as TradeModifier],
} satisfies CardImpl,
})

export const A088_HedgeKeeper_impl = A088_HedgeKeeper.impl
