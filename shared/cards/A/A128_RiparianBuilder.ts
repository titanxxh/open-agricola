import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { constructUnitDiscountTrade } from '../helpers/construct-cost'

const CARD_ID = 'A128_RiparianBuilder'
const triggerBuildListener: CardListenerRegistration = {
  id: 'A128-riparian-builder-after-opponent-reed-bank',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space.id !== 'reed-bank') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'construct',
        optional: true,
        promptKey: 'ui.interactionRiparianBuilderConstruct',
        sourceCard: CARD_ID,
        actionContext: { maxRooms: 1, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const constructDiscountListener: CardListenerRegistration = {
  id: 'A128-riparian-builder-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    if (context.player.houseType === 'clay') {
      return { trades: [constructUnitDiscountTrade(CARD_ID, { clay: 1 })] }
    }
    if (context.player.houseType === 'stone') {
      return { trades: [constructUnitDiscountTrade(CARD_ID, { stone: 2 })] }
    }
  },
}

const cardImpl = {
  listeners: [triggerBuildListener, constructDiscountListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A128_RiparianBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Riparian Builder",
    deck: "A",
    number: 128,
    category: "FARM_PLANNER",
    desc: ["Each time another player uses the __Reed Bank__ accumulation space, you can build a room: if you build a clay/stone room, you get a discount of 1 <CLAY>/2 <STONE>."],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const A128_RiparianBuilder_impl = A128_RiparianBuilder.impl
