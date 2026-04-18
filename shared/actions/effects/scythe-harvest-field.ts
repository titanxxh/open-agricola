import type { ActionDefinition } from '../../game/types'
import { fieldTopStack } from '../../game/field'

/**
 * Harvest ALL remaining crops from the TOP stack of a specific field.
 * Used by E73_Scythe. Takes { fieldIndex } in params.
 * Buried stacks (placed below the top) are not touched.
 */
export const scytheHarvestFieldAction: ActionDefinition = {
  id: 'scythe-harvest-field',
  nameKey: 'actions.scythe-harvest-field.name',
  descriptionKey: 'actions.scythe-harvest-field.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail', logKey: 'log.actionFail' }
    const field = player.fields[fieldIndex]
    if (!field) return { type: 'fail', logKey: 'log.actionFail' }
    const top = fieldTopStack(field)
    if (!top || top.remaining <= 0) return { type: 'fail', logKey: 'log.actionFail' }
    const crop = top.kind
    const amount = top.remaining
    player.resources[crop] = (player.resources[crop] ?? 0) + amount
    field.stacks.pop()
    return {
      type: 'ok',
      resourcesGained: { [crop]: amount },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { [crop]: amount }, cardId: sourceCard },
    }
  },
}
