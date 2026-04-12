import type { ActionDefinition } from '../../game/types'

/**
 * Harvest ALL remaining crops from a specific field.
 * Used by E73_Scythe. Takes { fieldIndex } in params.
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
    if (fieldIndex === undefined) return { type: 'fail' }
    const field = player.fields[fieldIndex]
    if (!field || !field.crop || field.remaining <= 0) return { type: 'fail' }
    const crop = field.crop
    const amount = field.remaining
    player.resources[crop] += amount
    field.remaining = 0
    field.crop = null
    return {
      type: 'ok',
      resourcesGained: { [crop]: amount },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { [crop]: amount }, cardId: sourceCard },
    }
  },
}
