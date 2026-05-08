import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C18_RollOverPlow } from '../../cards-display/C/C18_RollOverPlow'

const CARD_ID = C18_RollOverPlow.id

registerSelectionEffect('discard-all-crops', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (field && !fieldIsEmpty(field)) {
      field.stacks.length = 0
    }
  }
})

const anytimeListener: CardListenerRegistration = {
  id: 'C18-roll-over-plow-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const plantedFields = context.player.fields.filter(f => !fieldIsEmpty(f))
    if (plantedFields.length < 3) return
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
              positionFilter: 'has-crop',
              maxSelections: 1,
              selectionEffect: 'discard-all-crops',
            },
          },
          {
            type: 'leaf',
            actionId: 'plow',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C18_RollOverPlow.anytime',
    }
  },
}

export const C18_RollOverPlow_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
