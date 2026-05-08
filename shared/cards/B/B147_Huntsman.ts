import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B147_Huntsman } from '../../cards-display/B/B147_Huntsman'
export { B147_Huntsman }

const CARD_ID = B147_Huntsman.id

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

export const B147_Huntsman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
