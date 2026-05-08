// Runtime registration helpers. Sourced from S6a split of shared/cards/types.ts.
// Provides registerCardLookups() and registerAdHoc{Minor,Occupation} that
// install lookup functions into shared/cards-display/types.ts.
//
// Read-side metadata getters (getMinorImprovement / getOccupation /
// getRegisteredMinorImprovement / getRegisteredOccupation /
// majorImprovementIds / MinorImprovement class) live in
// `./registry-display.ts` so consumers that only register (e.g. `catalog.ts`
// at module init) don't pull `cards-display/_lookup` and induce a cycle.

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
