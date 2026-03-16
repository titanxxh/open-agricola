import type { ActionDefinition } from '../../game/types'

/**
 * Pays 1 grain from player reserve, or if none available, takes 1 grain from a sown field.
 * Used by cards like Silage that accept grain "from reserve or field".
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
    const grainField = player.fields.find(
      (f) => f.crop === 'grain' && f.remaining > 0,
    )
    if (grainField) {
      grainField.remaining -= 1
      if (grainField.remaining === 0) {
        grainField.crop = null
      }
      return { type: 'ok' }
    }
    return { type: 'fail', logKey: 'log.exchangeFail' }
  },
}
