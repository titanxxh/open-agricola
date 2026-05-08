import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A103_Portmonger } from '../../cards-display/A/A103_Portmonger'
export { A103_Portmonger }

const CARD_ID = A103_Portmonger.id

const isFoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.food ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A103-portmonger-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFoodAccumulationSpace(context.space)) return
    const foodGained = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.food ?? 0)
      : 0
    if (foodGained <= 0) return
    let gain: { vegetable?: number; grain?: number; reed?: number }
    if (foodGained === 1) {
      gain = { vegetable: 1 }
    } else if (foodGained === 2) {
      gain = { grain: 1 }
    } else {
      gain = { reed: 1 }
    }
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

export const A103_Portmonger_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
