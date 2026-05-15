// Runtime registration helpers. Sourced from S6a split of shared/cards/types.ts.
// Provides registerAdHoc{Minor,Occupation} which push fixture cards into
// `shared/cards-display/types.ts`'s ad-hoc maps. Catalog lookups
// (`getRegisteredMinorImprovement` / `getRegisteredOccupation`) merge those
// maps with the real catalog arrays — see `shared/cards/catalog.ts`.
//
// Read-side metadata getters (getMinorImprovement / getOccupation /
// getRegisteredMinorImprovement / getRegisteredOccupation /
// majorImprovementIds / MinorImprovement class) live in
// `./registry-display.ts` so consumers that only register (e.g. ad-hoc fixture
// tests) don't pull `cards-display/_lookup` and induce a cycle.

import type { CardBase } from '../cards-display/types'
import {
  __getAdHocMinors,
  __getAdHocOccupations,
} from '../cards-display/types'

export const registerAdHocMinorImprovement = (card: CardBase): void => {
  __getAdHocMinors().set(card.id, card)
}

export const registerAdHocOccupation = (card: CardBase): void => {
  __getAdHocOccupations().set(card.id, card)
}
