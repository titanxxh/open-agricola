import { describe, it } from 'vitest'

// C11 WildlifeReserve BGA constraint: 1 sheep + 1 boar + 1 cattle (per-type
// cap = 1 across the 3-capacity card zone).
//
// Our current zone schema (`AnimalZone` in shared/actions/helpers/animal-zones.ts)
// has only `capacity` + `animalType` (single type per zone). Card-typed zones
// are emitted by `onComputeAnimalZones` but the `enforceAnimalCapacity` reorg
// pipeline only handles pasture / house / stable zones — card zones do NOT
// participate in animal allocation today. Wiring per-type caps requires
// either:
//   (a) extending AnimalZone with `perTypeCap?: Record<string, number>` and
//       teaching enforceAnimalCapacity to allocate animals into card zones, or
//   (b) a reorganize listener that constrains the user's input by inspecting
//       the C11 zone meeple list (no schema change but invasive in reorg).
//
// Both are larger than the Sprint 7a quick-wins family scope. Defer with this
// stub and the audit verdict so progress isn't lost.

describe.skip('C11_WildlifeReserve — per-type cap (deferred)', () => {
  it('placeholder: needs AnimalZone.perTypeCap or reorg listener wiring', () => {})
})
