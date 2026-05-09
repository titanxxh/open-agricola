import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E59_CombandCutter } from '../../cards-display/E/E59_CombandCutter'

const CARD_ID = E59_CombandCutter.id

const listener: CardListenerRegistration = {
  id: 'E59-comb-and-cutter-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const sheepMarket = context.state.actionSpaces.find((s) => s.id === 'sheep-market')
    const sheepCount = sheepMarket?.resources?.sheep ?? 0
    const foodBonus = Math.min(sheepCount, 4)
    if (foodBonus <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: foodBonus }), sourceCard: CARD_ID }
  },
}

export const E59_CombandCutter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
