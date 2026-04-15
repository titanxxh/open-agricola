import type { ActionDefinition } from '../../game/types'
import { writeCardExtraData } from '../../cards/helpers/card-state'
import { runFieldEffect } from './field-effect-registry'

export const fieldSelectAction: ActionDefinition = {
  id: 'field-select',
  nameKey: 'actions.field-select.name',
  descriptionKey: 'actions.field-select.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ actionContext }) => {
    return {
      type: 'choice',
      promptKey: 'ui.interactionFieldSelect',
      promptParams: { maxSelections: (actionContext?.maxSelections as number) ?? 1 },
      options: [
        { value: 'confirm', labelKey: 'ui.interactionFieldSelectConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionCancel' },
      ],
    }
  },
  resolveChoice: ({ player, sourceCard, actionContext }, choice) => {
    if (choice === 'cancel') return { type: 'ok' }
    const fields = choice.split(',').filter(Boolean)

    if (sourceCard) {
      writeCardExtraData(player, sourceCard, 'selectedFields', fields)
    }

    const effect = actionContext?.fieldEffect as string | undefined
    if (effect) {
      runFieldEffect(effect, { player, fields, sourceCard })
    }

    return { type: 'ok', extraData: { selectedFields: fields } }
  },
}
