import type { ActionDefinition, ActionExecutionResult, PlayerState } from '../../game/types'
import { fieldIsEmpty } from '../../game/field'

export const getEmptyFields = (player: PlayerState) =>
  player.fields.filter(fieldIsEmpty)

export const canSow = (player: PlayerState) =>
  getEmptyFields(player).length > 0 &&
  (player.resources.grain > 0 || player.resources.vegetable > 0)

export const sowCrop = (
  player: PlayerState,
  crop: 'grain' | 'vegetable',
): ActionExecutionResult => {
  const emptyField = player.fields.find(fieldIsEmpty)
  if (!emptyField) {
    return { type: 'fail', logKey: 'log.sowFail' }
  }
  const have = player.resources[crop] ?? 0
  if (have <= 0) {
    return { type: 'fail', logKey: 'log.sowFail' }
  }
  player.resources[crop] = have - 1
  const remaining = crop === 'grain' ? 3 : 2
  emptyField.stacks.push({ kind: crop, remaining })
  return { type: 'ok', logKey: 'log.sow' }
}

export const sowAction: ActionDefinition = {
  id: 'sow',
  nameKey: 'actions.sow.name',
  descriptionKey: 'actions.sow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => canSow(player),
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionSowSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionSowConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionSowCancel' },
    ],
  }),
  resolveChoice: () => ({ type: 'ok' }),
}
