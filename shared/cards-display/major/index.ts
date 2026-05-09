import type { MajorCardDisplay } from '../../cards/major/types'
import { basketmaker } from './basketmaker'
import { clayOven } from './clay-oven'
import { cookingHearth1, cookingHearth2 } from './cooking-hearth'
import { fireplace1, fireplace2 } from './fireplace'
import { joinery } from './joinery'
import { pottery } from './pottery'
import { stoneOven } from './stone-oven'
import { well } from './well'

/**
 * All major improvement display data, ordered to match the legacy
 * `majorCardDefinitions` array in `shared/cards/major/index.ts`.
 * Hooks live in `shared/cards/major/effects.ts` (Sprint S8 split);
 * the composite (display + effects) is built by `cards/major/index.ts`.
 */
export const majorCardDisplayData: readonly MajorCardDisplay[] = [
  fireplace1,
  fireplace2,
  cookingHearth1,
  cookingHearth2,
  clayOven,
  stoneOven,
  well,
  joinery,
  pottery,
  basketmaker,
]

export const majorImprovementIdsList: readonly string[] =
  majorCardDisplayData.map((c) => c.id)

const majorDisplayMap = new Map<string, MajorCardDisplay>(
  majorCardDisplayData.map((c) => [c.id, c]),
)

/**
 * Lightweight major-only display lookup. Client paths (e.g.
 * `client/app/hooks/use-harvest-flow.ts`) should use this rather than
 * `getMajorCard` from `cards/major` to keep `cards/major/effects.ts`
 * out of the client bundle.
 */
export const getMajorCardDisplay = (id: string): MajorCardDisplay | undefined =>
  majorDisplayMap.get(id)
