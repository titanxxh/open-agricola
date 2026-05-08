// Runtime registration helpers. Sourced from S6a split of shared/cards/types.ts.
// Provides registerCardLookups() and registerAdHoc{Minor,Occupation} that
// install lookup functions into shared/cards-display/types.ts.

import type { CardBase } from '../cards-display/types'
import {
  __setMinorLookup,
  __setOccupationLookup,
  __getAdHocMinors,
  __getAdHocOccupations,
} from '../cards-display/types'

export const registerCardLookups = (lookups: {
  minor: (id: string) => CardBase | undefined
  occupation: (id: string) => CardBase | undefined
}): void => {
  __setMinorLookup(lookups.minor)
  __setOccupationLookup(lookups.occupation)
}

export const registerAdHocMinorImprovement = (card: CardBase): void => {
  __getAdHocMinors().set(card.id, card)
}

export const registerAdHocOccupation = (card: CardBase): void => {
  __getAdHocOccupations().set(card.id, card)
}
