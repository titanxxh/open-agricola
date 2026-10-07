import type { ActionChoiceOption } from '../contract/types'
import type { PendingEnvelope } from './types'

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
