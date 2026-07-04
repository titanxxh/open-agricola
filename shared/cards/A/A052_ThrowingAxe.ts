import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A052_ThrowingAxe'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

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

const cardImpl = {
  listeners: [listener],
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 7
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A052_ThrowingAxe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Throwing Axe',
    deck: 'A',
    number: 52,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use a <WOOD> accumulation space while there is at least 1 <PIG> on the __Pig Market__ accumulation space, you also get 2 <FOOD>.'],
    cost: { wood: 1 },
    prerequisite: 'Play in Round 7 or Later',
  },
  impl: cardImpl,
})

export const A052_ThrowingAxe_impl = A052_ThrowingAxe.impl
