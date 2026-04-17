import type { ActionDefinition } from '../../game/types'

/**
 * Swap a grain field (remaining=3) to a vegetable field (remaining=1).
 * Used by C69 Land Consolidation. Takes { row, col } in params identifying the field.
 */
export const swapFieldGrainToVegAction: ActionDefinition = {
  id: 'swap-field-grain-to-veg',
  nameKey: 'actions.swap-field-grain-to-veg.name',
  descriptionKey: 'actions.swap-field-grain-to-veg.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const row = (params as { row?: number } | undefined)?.row
    const col = (params as { col?: number } | undefined)?.col
    if (row === undefined || col === undefined) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const field = player.fields.find((f) => f.row === row && f.col === col)
    if (!field || field.crop !== 'grain' || field.remaining !== 3) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    field.crop = 'vegetable'
    field.remaining = 1
    return {
      type: 'ok',
      logKey: 'log.cardEffectGain',
      logParams: { gain: { vegetable: 1 }, cardId: sourceCard },
    }
  },
}
