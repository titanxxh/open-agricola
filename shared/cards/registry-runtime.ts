import type { CardDefinition } from '../contract/cards'

const adHocMinors = new Map<string, CardDefinition>()
const adHocOccupations = new Map<string, CardDefinition>()

export const registerCardLookups = (_lookups: {
  minor: (id: string) => CardDefinition | undefined
  occupation: (id: string) => CardDefinition | undefined
}): void => {}

export const registerAdHocMinorImprovement = (card: CardDefinition): void => {
  adHocMinors.set(card.id, card)
}

export const registerAdHocOccupation = (card: CardDefinition): void => {
  adHocOccupations.set(card.id, card)
}

export const getAdHocMinorImprovement = (id: string): CardDefinition | undefined =>
  adHocMinors.get(id)

export const getAdHocOccupation = (id: string): CardDefinition | undefined =>
  adHocOccupations.get(id)
