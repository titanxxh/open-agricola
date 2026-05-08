import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C36_ClayDeposit } from '../../cards-display/C/C36_ClayDeposit'
export { C36_ClayDeposit }

const CARD_ID = C36_ClayDeposit.id

const listener: CardListenerRegistration = {
  id: 'C36-clay-deposit-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.clay ?? 0) <= 0) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { clay: 1 },
      gain: { score: 1 },
      choiceLabelKey: 'ui.interactionClayDepositExchange',
    })
  },
}

export const C36_ClayDeposit_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
