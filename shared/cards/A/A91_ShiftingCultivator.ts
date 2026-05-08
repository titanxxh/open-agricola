import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A91_ShiftingCultivator } from '../../cards-display/A/A91_ShiftingCultivator'

const CARD_ID = A91_ShiftingCultivator.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A91-shifting-cultivator-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 3 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A91_ShiftingCultivator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
