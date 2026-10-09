import type { ActionChoiceOption } from '../../contract/types'

const cardNameNamespaces = { occupation: 'occupations', minor: 'minorImprovements', major: 'improvements' } as const

/** A selected card's identity is essential even when its source label is redundant. */
export const cardIdentityChoice = (cardId: string, kind: keyof typeof cardNameNamespaces, value = cardId): ActionChoiceOption => ({
  value,
  labelKey: `${cardNameNamespaces[kind]}.${cardId}.name`,
})
