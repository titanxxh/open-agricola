import type { ActionChoiceOption } from '../../contract/types'

export const MAX_DETAILED_CARD_CHOICES = 2

const cardNameNamespaces = { occupation: 'occupations', minor: 'minorImprovements', major: 'improvements' } as const

/** A selected card's identity is essential even when its source label is redundant. */
export const cardIdentityChoice = (cardId: string, kind: keyof typeof cardNameNamespaces, value = cardId): ActionChoiceOption => ({
  value,
  labelKey: `${cardNameNamespaces[kind]}.${cardId}.name`,
})
