import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B147_Huntsman'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'B147-huntsman-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { boar: 1 },
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B147_Huntsman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Huntsman',
    deck: 'B',
    number: 147,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time after you use a <WOOD> accumulation space, you can pay 1 <GRAIN> to get 1 <PIG>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B147_Huntsman_impl = B147_Huntsman.impl
