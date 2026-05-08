import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D105_Sculptor } from '../../cards-display/D/D105_Sculptor'
export { D105_Sculptor }

const CARD_ID = D105_Sculptor.id

const listener: CardListenerRegistration = {
  id: 'D105-sculptor-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    const isClay = (gainPerRound.clay ?? 0) > 0
    const isStone = (gainPerRound.stone ?? 0) > 0
    if (isClay) return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    if (isStone) return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const D105_Sculptor_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
