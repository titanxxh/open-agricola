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

const isLegacyStructuredChoiceValue = (
  envelope: PendingEnvelope,
  value: string,
): boolean => {
  if (envelope.request.kind !== 'choice') return false

  // Exchange and bake-bread expose compact batch payloads in the choice value.
  // They are parsed by the leaf resolver and are intentionally not enumerated
  // in the finite UI option list.
  if (envelope.pendingActionId === 'exchange') {
    return value.startsWith('bulk:')
  }
  if (envelope.pendingActionId === 'bake-bread') {
    return value.startsWith('bulk:') || value.startsWith('count-')
  }
  return false
}

export const isPendingChoiceValueAllowed = (
  envelope: PendingEnvelope,
  value: string,
): boolean => {
  const choices = pendingEnvelopeChoices(envelope)
  if (choices.length === 0) return true
  return choices.some((option) => option.value === value)
    || isLegacyStructuredChoiceValue(envelope, value)
}
