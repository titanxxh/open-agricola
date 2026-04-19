import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'

const CARD_ID = 'D96_Furnisher'

// D96 Furnisher: When you play this card, get 2 wood.
// Each time after you build at least one new room, you can build/play a number of
// improvements equal to rooms built, paying up to 1 wood less for each.
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
})

// After construct → optional improvement per room built
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
          actionId: 'improvement-any',
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

// computeCosts: reduce wood cost by 1 when improvement is played via Furnisher
const computeCostsListener: CardListenerRegistration = {
  id: 'D96-furnisher-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    // Reduce wood cost by 1 (the improvement doesn't need to cost any wood per BGA ruling)
    return { costs: { wood: -1 } }
  },
}

registerCardListener(afterConstructListener)
registerCardListener(computeCostsListener)

export const D96_Furnisher = new Occupation({
  id: CARD_ID,
  name: 'Furnisher',
  deck: 'D',
  number: 96,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you immediately get 2 <WOOD>. Each time after you build at least one new room, you can build or play a number of improvements equal to the number of new rooms you built, paying up to 1 <WOOD> less for each such improvement.',
  ],
  cost: {},
  players: '1+',
})
