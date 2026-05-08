import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E75_StoneAxe } from '../../cards-display/E/E75_StoneAxe'

const CARD_ID = E75_StoneAxe.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'E75-stone-axe-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { stone: 1 } }),
          gainLeaf(CARD_ID, { wood: 3 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E75_StoneAxe_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
