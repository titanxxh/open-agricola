import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { D96_Furnisher } from '../../cards-display/D/D96_Furnisher'

const CARD_ID = D96_Furnisher.id

const afterConstructListener: CardListenerRegistration = {
  id: 'D96-furnisher-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return

    // Build one optional improvement-any per room built, each with sourceCard = CARD_ID
    // so computeCosts can scope the wood discount
    const children = Array.from({ length: roomsBuilt }, () => ({
      type: 'seq' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'improvement',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    }))

    return {
      flow: {
        type: 'seq',
        optional: true,
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D96-furnisher-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    // Reduce wood cost by 1 (the improvement doesn't need to cost any wood per BGA ruling)
    return { costs: { wood: -1 } }
  },
}

export const D96_Furnisher_impl = {
  listeners: [afterConstructListener, computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
