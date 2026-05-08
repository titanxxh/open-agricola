import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D125_ForestTrader } from '../../cards-display/D/D125_ForestTrader'

const CARD_ID = D125_ForestTrader.id

const listener: CardListenerRegistration = {
  id: 'D125-forest-trader-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    const isWood = (gainPerRound.wood ?? 0) > 0
    const isClay = (gainPerRound.clay ?? 0) > 0
    if (!isWood && !isClay) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { wood: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { clay: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { reed: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 2 }, gain: { stone: 1 } }).flow!,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D125_ForestTrader_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
