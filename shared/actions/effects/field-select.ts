import type { ActionDefinition } from '../../game/types'
import { writeCardExtraData } from '../../cards/helpers/card-state'

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
    // choice is comma-separated position keys like "1-2,2-3"
    const fields = choice.split(',').filter(Boolean)

    // Store selections in cardStates for follow-up actions
    if (sourceCard) {
      writeCardExtraData(player, sourceCard, 'selectedFields', fields)
    }

    // Apply field effect if specified by the card
    const effect = actionContext?.fieldEffect as string | undefined
    if (effect === 'add-vegetable') {
      for (const key of fields) {
        const [r, c] = key.split('-').map(Number)
        const field = player.fields.find(f => f.row === r && f.col === c)
        if (field && field.crop === 'vegetable') {
          field.remaining += 1
        }
      }
    }
    if (effect === 'harvest-extra') {
      for (const key of fields) {
        const [r, c] = key.split('-').map(Number)
        const field = player.fields.find(f => f.row === r && f.col === c && f.crop && f.remaining > 0)
        if (field && field.crop) {
          player.resources[field.crop] = (player.resources[field.crop] ?? 0) + 1
        }
      }
    }

    if (effect === 'discard-grain-for-pigs') {
      let grainsRemoved = 0
      for (const key of fields) {
        const [r, c] = key.split('-').map(Number)
        const field = player.fields.find(f => f.row === r && f.col === c && f.crop === 'grain' && f.remaining > 0)
        if (field) {
          field.remaining -= 1
          if (field.remaining <= 0) field.crop = null
          grainsRemoved++
        }
      }
      // 1 field → 1 pig, 3 fields → 2 pigs, 4 fields → 3 pigs (2 fields is invalid)
      const pigs = grainsRemoved >= 4 ? 3 : grainsRemoved >= 3 ? 2 : grainsRemoved >= 1 ? 1 : 0
      player.resources.boar = (player.resources.boar ?? 0) + pigs
    }

    if (effect === 'remove-all-grain-for-wood') {
      for (const key of fields) {
        const [r, c] = key.split('-').map(Number)
        const field = player.fields.find(f => f.row === r && f.col === c && f.crop === 'grain')
        if (field) {
          const grainCount = field.remaining
          field.remaining = 0
          field.crop = null
          player.resources.wood = (player.resources.wood ?? 0) + grainCount * 2
        }
      }
    }

    if (effect === 'take-vegetable') {
      for (const key of fields) {
        const [r, c] = key.split('-').map(Number)
        const field = player.fields.find(f => f.row === r && f.col === c && f.crop === 'vegetable' && f.remaining > 0)
        if (field) {
          field.remaining -= 1
          if (field.remaining <= 0) field.crop = null
          player.resources.vegetable = (player.resources.vegetable ?? 0) + 1
        }
      }
    }

    return { type: 'ok', extraData: { selectedFields: fields } }
  },
}
