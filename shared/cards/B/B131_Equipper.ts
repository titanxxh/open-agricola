import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B131_Equipper'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'B131-equipper-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { types: ['minor'], trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B131_Equipper = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Equipper',
    deck: 'B',
    number: 131,
    category: 'ACTIONS_BOOSTER',
    desc: ['Immediately after each time you use a <WOOD> accumulation space, you can play a minor improvement.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B131_Equipper_impl = B131_Equipper.impl
