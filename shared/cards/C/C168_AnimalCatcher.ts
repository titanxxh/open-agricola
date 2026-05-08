import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C168_AnimalCatcher } from '../../cards-display/C/C168_AnimalCatcher'
export { C168_AnimalCatcher }

const CARD_ID = C168_AnimalCatcher.id

const harvestRounds = [4, 7, 9, 11, 13, 14]

/**
 * computeReplace on gain action when on day-laborer space:
 * Offer an alternative: gain 1 sheep + 1 boar + 1 cattle, then pay 1 food per remaining harvest.
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'C168-animal-catcher-replace-day-laborer',
  cardIds: [CARD_ID],
  actions: ['gain'],
  phases: ['computeReplace' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionContext?.checkedReplaceAction) return
    if (context.sourceCard === CARD_ID) return
    if (context.space?.id !== 'day-laborer') return
    const remaining = harvestRounds.filter((r) => r >= context.state.round).length
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { sheep: 1, boar: 1, cattle: 1 }),
          ...(remaining > 0
            ? [payLeaf({ cardId: CARD_ID, cost: { food: remaining } })]
            : []),
        ],
      },
    }
  },
}

export const C168_AnimalCatcher_impl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
