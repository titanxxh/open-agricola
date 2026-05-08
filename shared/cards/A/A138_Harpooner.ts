import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A138_Harpooner } from '../../cards-display/A/A138_Harpooner'
export { A138_Harpooner }

const CARD_ID = A138_Harpooner.id

const listener: CardListenerRegistration = {
  id: 'A138-harpooner-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'fishing') return
    const foodGain = familySize(context.player)
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
          gainLeaf(CARD_ID, { food: foodGain, reed: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A138_Harpooner_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
