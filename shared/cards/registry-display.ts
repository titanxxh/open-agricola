// Forwarding layer between cards-display (display layer) and
// session/engine/actions (impl layer). Per S6c Rule 8, impl files cannot
// import `shared/cards-display/**` directly — they go through this module.
//
// Kept separate from `./registry-runtime` so that `cards/catalog.ts`
// (which depends on `registerCardLookups` and feeds back into cards-display)
// does not pull `cards-display/_lookup` at module init and cause a cycle.

import {
  MinorImprovement as MinorImprovementClass,
  getRegisteredMinorImprovement as getRegisteredMinorImprovementImpl,
  getRegisteredOccupation as getRegisteredOccupationImpl,
} from '../cards-display/types'
import {
  getMinorImprovement as getMinorImprovementImpl,
  getOccupation as getOccupationImpl,
  majorImprovementIds as majorImprovementIdsImpl,
} from '../cards-display/_lookup'
import type { CardBase } from '../cards-display/types'

export const getMinorImprovement = getMinorImprovementImpl
export const getOccupation = getOccupationImpl
export const getRegisteredMinorImprovement = getRegisteredMinorImprovementImpl
export const getRegisteredOccupation = getRegisteredOccupationImpl
export const majorImprovementIds = majorImprovementIdsImpl
export const MinorImprovement = MinorImprovementClass
export type { CardBase }
