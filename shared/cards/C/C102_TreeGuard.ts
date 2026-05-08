import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C102_TreeGuard } from '../../cards-display/C/C102_TreeGuard'
export { C102_TreeGuard }

const CARD_ID = C102_TreeGuard.id

const listener: CardListenerRegistration = {
  id: 'C102-tree-guard-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.wood ?? 0) <= 0) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 4 },
      gain: { stone: 2, clay: 1, reed: 1, grain: 1 },
    })
  },
}

export const C102_TreeGuard_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
