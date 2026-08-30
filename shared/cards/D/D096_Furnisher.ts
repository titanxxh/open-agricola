import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { PaymentSolver } from '../../actions/payment'
import type { DraftGameEvent, FarmRoomBuiltEvent } from '../../contract/events'

const CARD_ID = 'D096_Furnisher'
type QueryableFarmRoomBuiltEvent = FarmRoomBuiltEvent | DraftGameEvent<'farm.roomBuilt'>

const isFarmRoomBuiltEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableFarmRoomBuiltEvent => event.type === 'farm.roomBuilt'

const improvementLeaf = (remaining: number) => ({
  type: 'leaf' as const,
  actionId: 'improvement',
  sourceCard: CARD_ID,
  actionContext: {
    trueAction: false,
    furnisherRemainingImprovements: remaining,
  },
})

const afterConstructListener: CardListenerRegistration = {
  id: 'D96-furnisher-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = (context.actionEvents ?? context.transactionEvents)
      .filter(isFarmRoomBuiltEvent)
      .flatMap((event) => event.rooms)
      .filter((room) => room.playerId === context.player.id)
      .length
    if (roomsBuilt <= 0) return

    return {
      flow: {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        params: {
          promptKey: 'ui.interactionFurnisherCount',
          options: Array.from({ length: roomsBuilt + 1 }, (_, count) => ({
            value: String(count),
            labelKey: 'ui.interactionFurnisherCountChoice',
            labelParams: { count },
          })),
        },
        actionContext: { furnisherImprovementCount: roomsBuilt },
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
  deriveCardCostCandidate: (context, candidate) => {
    if (context.actionCardId !== CARD_ID) return null
    return PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { wood: 1 })
  },
}

const afterImprovementListener: CardListenerRegistration = {
  id: 'D96-furnisher-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const remaining = context.actionContext?.furnisherRemainingImprovements
    if (typeof remaining !== 'number' || !Number.isInteger(remaining) || remaining <= 1) return
    return { flow: improvementLeaf(remaining - 1), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterConstructListener, computeCostsListener, afterImprovementListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
    resolveChoice: (_state, _player, choice, context) => {
      const maxCount = context.actionContext?.furnisherImprovementCount
      const count = Number(choice)
      if (
        typeof maxCount !== 'number' ||
        !Number.isInteger(maxCount) ||
        !Number.isInteger(count) ||
        count <= 0 ||
        count > maxCount
      ) return
      return improvementLeaf(count)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D096_Furnisher = defineOccupationCard({
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

export const D096_Furnisher_impl = D096_Furnisher.impl
