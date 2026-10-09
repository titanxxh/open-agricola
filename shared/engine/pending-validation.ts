import type { ActionChoiceOption, InteractionRequest } from '../contract/types'
import type { PendingEnvelope } from './types'

/**
 * Option surface stored with a pending request. Every engine path that opens
 * a pending interaction uses it, so no request kind completes before the
 * player submits it.
 */
export const interactionRequestChoices = (request: InteractionRequest): ActionChoiceOption[] => {
  switch (request.kind) {
    case 'choice':
      return request.options
    case 'animal-reorg':
      // Reorganization submits `confirm`; cancel stays unavailable.
      return [{ value: 'confirm', labelKey: 'ui.interactionAnimalReorgConfirm' }]
    case 'farm-select':
      return request.options ?? [
        { value: 'confirm', labelKey: 'ui.interactionFarmSelectConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionFarmSelectCancel' },
      ]
    case 'confirm-next-player':
    case 'confirm-player-switch':
    case 'feed':
    case 'heating':
    case 'selection':
    case 'card-draft':
    case 'select-trigger':
    case 'engine-blocked':
    case 'resource-quantity-select':
    case 'resource-batch-exchange-select':
      // Structured submissions carry their own payload validation.
      return []
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}

export const pendingEnvelopeChoices = (
  envelope: PendingEnvelope | null,
): ActionChoiceOption[] => {
  if (!envelope) return []
  if (envelope.choices) return envelope.choices
  const request = envelope.request
  if (request.kind === 'choice' || request.kind === 'select-trigger') return request.options
  if (request.kind === 'farm-select') return request.options ?? []
  return []
}

const isStructuredChoiceValue = (
  envelope: PendingEnvelope,
  value: string,
): boolean => {
  if (envelope.request.kind !== 'choice') return false
  return envelope.request.structuredChoicePrefixes?.some((prefix) => value.startsWith(prefix)) ?? false
}

export const isPendingChoiceValueAllowed = (
  envelope: PendingEnvelope,
  value: string,
): boolean => {
  const request = envelope.request
  if (request.kind === 'choice' && request.multiSelect) {
    const { valuePrefix, minSelections, maxSelections } = request.multiSelect
    if (!value.startsWith(valuePrefix)) return false
    const suffix = value.slice(valuePrefix.length)
    const selected = suffix === '' ? [] : suffix.split(',')
    return selected.length >= minSelections && selected.length <= maxSelections
      && new Set(selected).size === selected.length
      && selected.every((entry) => entry !== '' && request.options.some(
        (option) => option.value === entry && option.disabled !== true,
      ))
  }
  const choices = pendingEnvelopeChoices(envelope)
  if (choices.length === 0) return true
  return choices.some((option) => option.value === value && option.disabled !== true)
    || (envelope.request.kind === 'select-trigger' &&
      choices.some((option) => option.sourceCard === value && option.disabled !== true))
    || isStructuredChoiceValue(envelope, value)
}
