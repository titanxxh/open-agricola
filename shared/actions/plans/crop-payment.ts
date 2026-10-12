import type { ActionDefinition, ActionChoiceOption, ChoiceDescriptionPreview, PlayerState } from '../../contract/types'
import { getLogicalFields, mutateLogicalFields } from '../../cards/helpers/card-field'
import { payLeaf } from '../../cards/helpers/pay-gain-node'

export const createCropPaymentAction = (sourceCard: string, id: string, crop: 'grain' | 'vegetable', amount: number): ActionDefinition => {
  const fieldsOf = (player: PlayerState) => getLogicalFields(player).flatMap(field => {
    const top = [...field.slots].reverse().find(slot => slot.stack)
    return top?.stack?.kind === crop && top.stack.remaining >= amount ? [{ field, top }] : []
  })
  const fieldDescription = (): ChoiceDescriptionPreview => ({ kind: 'action', labelKey: 'actions.selection.name', showLabel: false,
    effectPreview: { kind: 'fieldOperation', operation: { kind: 'remove-top', crop, amount, gain: {} }, minSelections: 1, maxSelections: 1 },
  })
  const optionsOf = (player: PlayerState): ActionChoiceOption[] => [
    ...(player.resources[crop] >= amount ? [{ value: 'reserve', labelKey: `resources.${crop}`, descriptionPreview: { kind: 'action' as const,
      labelKey: 'actions.pay.name', showLabel: false, effectPreview: { kind: 'payment' as const, resourcesPaid: { [crop]: amount } } } }] : []),
    ...fieldsOf(player).map(({ field }) => ({ value: field.id, labelKey: field.sourceCard ? `cards.${field.sourceCard}.name` : 'ui.choicePreviewFieldAt',
      labelParams: { row: field.row + 1, col: field.col + 1 }, descriptionPreview: fieldDescription() })),
  ]
  return {
    id, nameKey: 'actions.pay-grain-any.name', descriptionKey: 'actions.pay-grain-any.description', roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: (_state, player) => optionsOf(player).length > 0,
    previewEffect: ({ player }) => ({ kind: 'rule', description: { kind: 'group', operator: 'xor', separator: ' / ', parts: optionsOf(player).flatMap(option => option.descriptionPreview ? [option.descriptionPreview] : []) } }),
    getBaseChoiceOptions: ({ player }) => optionsOf(player),
    execute: () => ({ type: 'fail', errorKey: 'log.exchangeFail' }),
    resolveChoice: ({ state, player, eventSink }, choice) => {
      if (choice === 'reserve' && player.resources[crop] >= amount) return { type: 'flow', flow: payLeaf({ cardId: sourceCard, cost: { [crop]: amount } }) }
      const field = fieldsOf(player).find(entry => entry.field.id === choice)
      if (!field) return { type: 'fail', errorKey: 'log.exchangeFail' }
      const removed = mutateLogicalFields(state, player, { sourceCard, eventSink }).remove({ fieldId: field.field.id, slot: field.top.index }, amount)
      return removed.ok ? removed.flow ? { type: 'flow', flow: removed.flow } : { type: 'ok' } : { type: 'fail', errorKey: 'log.exchangeFail' }
    },
  }
}
