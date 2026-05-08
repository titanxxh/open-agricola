import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A56_Basket } from '../../cards-display/A/A56_Basket'
export { A56_Basket }

const CARD_ID = A56_Basket.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A56-basket-immediately-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 2 },
      gain: { food: 3 },
      choiceLabelKey: 'minors.A56_Basket.name',
    })
  },
}

export const A56_Basket_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
