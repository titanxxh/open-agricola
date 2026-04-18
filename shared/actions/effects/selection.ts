import type { ActionDefinition } from '../../game/types'
import { writeCardExtraData } from '../../cards/helpers/card-state'
import { runSelectionEffect } from './selection-effect-registry'

export const selectionAction: ActionDefinition = {
  id: 'selection',
  nameKey: 'actions.selection.name',
  descriptionKey: 'actions.selection.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ actionContext }) => ({
    type: 'choice',
    promptKey: 'ui.interactionSelection',
    promptParams: { maxSelections: (actionContext?.maxSelections as number) ?? 1 },
    options: [
      { value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionCancel' },
    ],
  }),
  resolveChoice: ({ player, sourceCard, actionContext }, choice) => {
    if (choice === 'cancel') return { type: 'ok' }
    const positions = choice.split(',').filter(Boolean)

    if (sourceCard) {
      writeCardExtraData(player, sourceCard, 'selectedPositions', positions)
    }

    const effect = actionContext?.selectionEffect as string | undefined
    if (effect) {
      runSelectionEffect(effect, { player, positions, sourceCard })
    }

    return { type: 'ok', extraData: { selectedPositions: positions } }
  },
}
