import type { ActionDefinition } from '../../../game/types'
import { writeCardExtraData } from '../../../cards/helpers/card-state'
import { runSelectionEffect } from '../../helpers/selection-effect-registry'

export const selectionAction: ActionDefinition = {
  id: 'selection',
  nameKey: 'actions.selection.name',
  descriptionKey: 'actions.selection.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ actionContext }) => {
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    const promptKey =
      kind === 'occupation-hand'
        ? 'ui.interactionOccupationHand'
        : 'ui.interactionSelection'
    const maxSelections = (actionContext?.maxSelections as number) ?? 1
    return {
      type: 'choice',
      promptKey,
      promptParams: { maxSelections },
      options: [
        { value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionCancel' },
      ],
    }
  },
  resolveChoice: ({ player, sourceCard, actionContext, state }, choice) => {
    if (choice === 'cancel') return { type: 'ok' }
    const positions = choice.split(',').filter(Boolean)

    if (sourceCard) {
      writeCardExtraData(player, sourceCard, 'selectedPositions', positions)
    }

    const effect = actionContext?.selectionEffect as string | undefined
    if (effect) {
      const followup = runSelectionEffect(effect, { player, positions, sourceCard, state })
      if (followup) {
        return { type: 'flow', flow: followup, extraData: { selectedPositions: positions } }
      }
    }

    return { type: 'ok', extraData: { selectedPositions: positions } }
  },
}
