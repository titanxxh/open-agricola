import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D169_Plowsmith'
const listener: CardListenerRegistration = {
  id: 'D169-plowsmith-opponent-wood-accumulation',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpaceId(context.space?.id)) return
    if ((context.ownerPlayer?.resources.food ?? 0) < 1) return
    const woodTaken = sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'wood')
    if (woodTaken < 4) return
    return {
      ...payThenActionFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        action: { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D169_Plowsmith = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plowsmith',
    deck: 'D',
    number: 169,
    category: 'FARM_PLANNER',
    desc: ['Each time another player takes at least 4 wood from an accumulation space, you can immediately pay 1 food to plow 1 field.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D169_Plowsmith_impl = D169_Plowsmith.impl
