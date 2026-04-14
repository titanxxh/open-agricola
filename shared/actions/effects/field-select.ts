import type { ActionDefinition } from '../../game/types'

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
  resolveChoice: (_context, choice) => {
    if (choice === 'cancel') return { type: 'ok' }
    // choice is comma-separated position keys like "1-2,2-3"
    // The calling card reads selectedFields from the action result
    return { type: 'ok', extraData: { selectedFields: choice.split(',').filter(Boolean) } }
  },
}
