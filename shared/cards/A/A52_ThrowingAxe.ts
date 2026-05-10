import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A52_ThrowingAxe } from '../../cards-display/A/A52_ThrowingAxe'

const CARD_ID = A52_ThrowingAxe.id

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

export const A52_ThrowingAxe_impl = {
  listeners: [listener],
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 7
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
