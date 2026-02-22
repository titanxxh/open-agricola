import type { ActionExecutionResult, PlayerState } from '../../game/types'

export const getEmptyFields = (player: PlayerState) =>
  player.fields.filter((field) => field.crop === null)

export const canSow = (player: PlayerState) =>
  getEmptyFields(player).length > 0 &&
  (player.resources.grain > 0 || player.resources.vegetable > 0)

export const sowCrop = (
  player: PlayerState,
  crop: 'grain' | 'vegetable',
): ActionExecutionResult => {
  const emptyField = player.fields.find((field) => field.crop === null)
  if (!emptyField) {
    return { type: 'fail', logKey: 'log.sowFail' }
  }
  if (crop === 'grain') {
    if (player.resources.grain <= 0) {
      return { type: 'fail', logKey: 'log.sowFail' }
    }
    player.resources.grain -= 1
    emptyField.crop = 'grain'
    emptyField.remaining = 3
    return { type: 'ok', logKey: 'log.sow' }
  }
  if (player.resources.vegetable <= 0) {
    return { type: 'fail', logKey: 'log.sowFail' }
  }
  player.resources.vegetable -= 1
  emptyField.crop = 'vegetable'
  emptyField.remaining = 2
  return { type: 'ok', logKey: 'log.sow' }
}
