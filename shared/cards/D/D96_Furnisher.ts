import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'D96_Furnisher'
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
    return {
      candidateDerivers: [{
        id: `${CARD_ID}:furnisher-wood-discount`,
        sourceCardId: CARD_ID,
        derive(candidate) {
          const wood = candidate.cost.wood ?? 0
          if (wood <= 0) return []
          return [{ cost: { ...candidate.cost, wood: Math.max(0, wood - 1) } }]
        },
      }],
    }
  },
}

const cardImpl = {
  listeners: [afterConstructListener, computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D96_Furnisher = defineOccupationCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const D96_Furnisher_impl = D96_Furnisher.impl
