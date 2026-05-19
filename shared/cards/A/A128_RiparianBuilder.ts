import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A128_RiparianBuilder } from '../../cards-display/A/A128_RiparianBuilder'

const CARD_ID = A128_RiparianBuilder.id

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
      return { costs: { clay: -1 } }
    }
    if (context.player.houseType === 'stone') {
      return { costs: { stone: -2 } }
    }
  },
}

export const A128_RiparianBuilder_impl = {
  listeners: [triggerBuildListener, constructDiscountListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
