import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A52_ThrowingAxe'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

// A52 Throwing Axe: Each time you use a wood accumulation space while there is at least
// 1 PIG on the Pig Market accumulation space, you also get 2 FOOD.
// This triggers before the space is collected (before phase of collect action).
const listener: CardListenerRegistration = {
  id: 'A52-throwing-axe-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    // Check if there is at least 1 pig on the pig-market space
    const pigMarket = context.state.actionSpaces.find((s) => s.id === 'pig-market')
    const pigsOnMarket = pigMarket?.resources?.boar ?? 0
    if (pigsOnMarket < 1) return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const A52_ThrowingAxe = new MinorImprovement({
  id: CARD_ID,
  name: 'Throwing Axe',
  deck: 'A',
  number: 52,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use a wood accumulation space while there is at least 1 <PIG> on the __Pig Market__ accumulation space, you also get 2 <FOOD>.'],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 7 or Later',
  newSet: true,
})

export const A52_ThrowingAxe_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
