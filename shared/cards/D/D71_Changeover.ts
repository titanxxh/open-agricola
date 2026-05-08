import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D71_Changeover } from '../../cards-display/D/D71_Changeover'
export { D71_Changeover }

const CARD_ID = D71_Changeover.id

registerSelectionEffect('discard-single-crop', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (field && fieldTotalRemaining(field) === 1) {
      field.stacks.length = 0
    }
  }
})

const anytimeListener: CardListenerRegistration = {
  id: 'D71-changeover-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const eligibleFields = context.player.fields.filter(f => fieldTotalRemaining(f) === 1)
    if (eligibleFields.length === 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'selection',
            sourceCard: CARD_ID,
            actionContext: {
              selectionKind: 'farm-position',
              positionFilter: 'has-exactly-1-crop',
              maxSelections: 1,
              selectionEffect: 'discard-single-crop',
            },
          },
          {
            type: 'leaf',
            actionId: 'sow',
            sourceCard: CARD_ID,
            optional: true,
            actionContext: { allowedFields: 'fromSelectedFields', sourceCard: CARD_ID },
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D71_Changeover.anytime',
    }
  },
}

export const D71_Changeover_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
