import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'
import type { BonusModifier } from '../../game/types'

const CARD_ID = 'C88_CarpentersApprentice'

const constructCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'wood') return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return { costs: { wood: -2 } }
  },
}

const stablesCostListener: CardListenerRegistration = {
  id: 'C88-carpenters-apprentice-costs-stables',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const stablesBuilt = context.player.stableTiles.length
    if (stablesBuilt >= 2) {
      incCounter(context.player, CARD_ID, 'triggerCount')
      return { costs: { wood: -1 } }
    }
  },
}

registerCardListener(constructCostListener)
registerCardListener(stablesCostListener)

export const C88_CarpentersApprentice = new Occupation({
  id: CARD_ID,
  name: "Carpenter's Apprentice",
  deck: "C",
  number: 88,
  category: "FARM_PLANNER",
  desc: ["Wood rooms cost you 2 <WOOD> less. Your 3rd and 4th stable each cost you 1 <WOOD> less. Your 13th to 15th fence each cost you nothing."],
  cost: {},
  players: "1+",
  modifier: {
    type: 'bonus',
    cardId: CARD_ID,
    appliesTo: ['construct'],
    discount: { wood: 2 },
  } as BonusModifier,
})
