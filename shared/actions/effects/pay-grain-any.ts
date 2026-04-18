import type { ActionDefinition } from '../../game/types'
import { fieldTopStack, fieldPopIfDepleted } from '../../game/field'

/**
 * Pays 1 grain from player reserve, or if none available, takes 1 grain from a sown field.
 * Used by cards like Silage that accept grain "from reserve or field".
 * Requires the TOP stack of the field to be grain (not a buried grain stack).
 */
export const payGrainAnyAction: ActionDefinition = {
  id: 'pay-grain-any',
  nameKey: 'actions.pay-grain-any.name',
  descriptionKey: 'actions.pay-grain-any.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    if (player.resources.grain >= 1) {
      player.resources.grain -= 1
      return { type: 'ok' }
    }
    const grainField = player.fields.find((f) => {
      const top = fieldTopStack(f)
      return top?.kind === 'grain' && top.remaining > 0
    })
    if (grainField) {
      const top = fieldTopStack(grainField)
      if (top) {
        top.remaining -= 1
        fieldPopIfDepleted(grainField)
      }
      return { type: 'ok' }
    }
    return { type: 'fail', logKey: 'log.exchangeFail' }
  },
}
