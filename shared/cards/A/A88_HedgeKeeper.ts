import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { BonusModifier } from '../../game/types'

const CARD_ID = 'A88_HedgeKeeper'

const computeCostsListener: CardListenerRegistration = {
  id: 'A88-hedge-keeper-costs-fence',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { costs: { wood: -3 } }
  },
}

registerCardListener(computeCostsListener)

export const A88_HedgeKeeper = new Occupation({
  id: CARD_ID,
  name: "Hedge Keeper",
  deck: "A",
  number: 88,
  category: "FARM_PLANNER",
  desc: ["Each time you take a __Build Fences__ action, you do not have to pay <WOOD> for 3 of the fences you build."],
  cost: {},
  players: "1+",
  modifier: {
    type: 'bonus',
    cardId: CARD_ID,
    appliesTo: ['fencing'],
    discount: { wood: 3 },
  } as BonusModifier,
})
