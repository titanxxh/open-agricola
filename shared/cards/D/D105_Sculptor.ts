import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D105_Sculptor'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D105_Sculptor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sculptor',
    deck: 'D',
    number: 105,
    category: 'GOODS_PROVIDER',
    desc: ['Each time you use a clay accumulation space, you also get 1 <FOOD>. Each time you use a stone accumulation space, you also get 1 <GRAIN>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D105_Sculptor_impl = D105_Sculptor.impl
