import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C036_ClayDeposit'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C036_ClayDeposit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Deposit',
    deck: 'C',
    number: 36,
    category: 'POINTS_PROVIDER',
    desc: [
        'Immediately after each time you use a <CLAY> accumulation space, you can exchange 1 <CLAY> for 1 bonus <SCORE>. If you do, place the <CLAY> on the accumulation space.',
      ],
    cost: { food: 2 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const C036_ClayDeposit_impl = C036_ClayDeposit.impl
