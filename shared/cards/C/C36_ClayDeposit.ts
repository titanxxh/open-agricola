import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C36_ClayDeposit'

// C36 Clay Deposit: Immediately after each time you use a clay accumulation space,
// you can exchange 1 CLAY for 1 bonus SCORE. If you do, place the CLAY on the space.
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

export const C36_ClayDeposit = new MinorImprovement({
  id: CARD_ID,
  name: 'Clay Deposit',
  deck: 'C',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: [
    'Immediately after each time you use a clay accumulation space, you can exchange 1 <CLAY> for 1 bonus <SCORE>. If you do, place the <CLAY> on the accumulation space.',
  ],
  cost: { food: 2 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})

export const C36_ClayDeposit_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
