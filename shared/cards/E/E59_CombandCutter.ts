import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E59_CombandCutter'

// Each time you use Day Laborer, get 1 additional food for each sheep on the
// Sheep Market accumulation space, up to a maximum of 4 additional food.
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

export const E59_CombandCutter = new MinorImprovement({
  id: CARD_ID,
  name: 'Comb and Cutter',
  deck: 'E',
  number: 59,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use the __Day Laborer__ action space, you get 1 additional <FOOD> for each <SHEEP> on the __Sheep Market__ accumulation space, up to a maximum of 4 additional <FOOD>.'],
  cost: { wood: 1 },
})

export const E59_CombandCutter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
