import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { TradeModifier } from '../../game/types'

const CARD_ID = 'A123_FrameBuilder'

const buildCostAdjustment = (context: CardListenerContext) => {
  if (context.player.houseType === 'clay') {
    return { wood: 1, clay: -2 }
  }
  if (context.player.houseType === 'stone') {
    return { wood: 1, stone: -2 }
  }
  return undefined
}

const computeCostsListener: CardListenerRegistration = {
  id: 'A123-frame-builder-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const costs = buildCostAdjustment(context)
    if (!costs) return
    return { costs }
  },
}

registerCardListener(computeCostsListener)

export const A123_FrameBuilder = new Occupation({
  id: CARD_ID,
  name: "Frame Builder",
  deck: "A",
  number: 123,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>."],
  cost: {},
  players: "1+",
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['construct', 'renovation'],
    from: { clay: 2 },
    to: { wood: 1 },
    max: 1,
  } as TradeModifier,
})
