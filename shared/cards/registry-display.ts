// Forwarding layer between cards-display (display layer) and
// session/engine/actions (impl layer). Per S6c Rule 8, impl files cannot
// import `shared/cards-display/**` directly — they go through this module.
//
// `getRegisteredMinorImprovement` / `getRegisteredOccupation` come from
// `./catalog`, which owns the catalog arrays + ad-hoc map merge.
//
// IMPORTANT: catalog ↔ registry-display participates in a circular import
// (catalog → major/effects → stage-effects → actions/effects/exchange →
// registry-display → catalog). The `Registered*` lookups must therefore be
// wrapped in arrow functions, not re-assigned via `export const x = xImpl`,
// so the underlying binding is dereferenced lazily on call (ESM live binding)
// rather than at module init time (TDZ).

import { MinorImprovement as MinorImprovementClass } from '../cards-display/types'
import {
  getRegisteredMinorImprovement as getRegisteredMinorImprovementImpl,
  getRegisteredOccupation as getRegisteredOccupationImpl,
} from './catalog'
import {
  getMinorImprovement as getMinorImprovementImpl,
  getOccupation as getOccupationImpl,
  majorImprovementIds as majorImprovementIdsImpl,
} from '../cards-display/_lookup'
import type { CardBase } from '../cards-display/types'

export const getMinorImprovement = getMinorImprovementImpl
export const getOccupation = getOccupationImpl
export const getRegisteredMinorImprovement = (id: string) =>
  getRegisteredMinorImprovementImpl(id)
export const getRegisteredOccupation = (id: string) =>
  getRegisteredOccupationImpl(id)
export const majorImprovementIds = majorImprovementIdsImpl
export const MinorImprovement = MinorImprovementClass
export type { CardBase }
