import { describe, expect, it } from 'vitest'
import { getMinorImprovementCard, getOccupationCard } from '../catalog'
import { C039_StudioBoat } from '../../cards/C/C039_StudioBoat'

type CostMap = Partial<Record<
  'wood' | 'clay' | 'reed' | 'stone' | 'food' | 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle',
  number
>>

type Case = {
  id: string
  cost: CostMap
  vp?: number
  // E95 is an occupation; C39 is a PlayerActionCard not registered in the
  // catalog arrays (it only side-effect-imports for action-space registration),
  // so resolve it via direct module import. Everything else flows through
  // getMinorImprovementCard.
  kind: 'minor' | 'occupation' | 'direct'
}

const cases: Case[] = [
  { id: 'A038_WoolBlankets',        kind: 'minor', cost: {} },
  { id: 'B004_WoodPile',             kind: 'minor', cost: {} },
  { id: 'B042_ForestInn',           kind: 'minor', cost: { clay: 1, reed: 1 }, vp: 1 },
  { id: 'C003_CarriageTrip',         kind: 'minor', cost: {} },
  { id: 'C030_HalfTimberedHouse',   kind: 'minor', cost: { wood: 1, clay: 1, stone: 2, reed: 1 } },
  { id: 'C033_GreeningPlan',        kind: 'minor', cost: { food: 3 } },
  { id: 'C035_LanternHouse',        kind: 'minor', cost: { wood: 1 } },
  { id: 'C039_StudioBoat',          kind: 'direct', cost: { wood: 1 } },
  { id: 'C048_Farmstead',           kind: 'minor', cost: {} },
  { id: 'C059_SchnappsDistillery',  kind: 'minor', cost: { stone: 2, vegetable: 1 } },
  { id: 'D024_BrotherlyLove',       kind: 'minor', cost: { food: 1 } },
  { id: 'D029_MuckRake',            kind: 'minor', cost: { wood: 1 } },
  { id: 'D039_TruffleSlicer',       kind: 'minor', cost: { wood: 1 } },
  { id: 'E032_Nave',                kind: 'minor', cost: { stone: 2, reed: 1 } },
  { id: 'E034_LandRegister',        kind: 'minor', cost: { wood: 1 } },
  { id: 'E095_Miller',              kind: 'occupation', cost: {} },
  { id: 'A039_Chapel',             kind: 'minor', cost: { wood: 3, clay: 2 }, vp: 3 },
  // metadata-3b forward 3
  { id: 'A025_Bassinet',           kind: 'minor', cost: { wood: 1, reed: 1 } },
  { id: 'A031_DebtSecurity',       kind: 'minor', cost: { food: 2 } },
  { id: 'E035_Misanthropy',        kind: 'minor', cost: { wood: 1 } },
  // metadata-3b reverse 8 (deleted to match BGA missing)
  { id: 'A001_Shelter',             kind: 'minor', cost: {} },
  { id: 'A064_BarleyMill',         kind: 'minor', cost: {} },
  { id: 'B026_AgrarianFences',     kind: 'minor', cost: {} },
  { id: 'B005_StoreofExperience',   kind: 'minor', cost: {} },
  { id: 'B007_Wage',                kind: 'minor', cost: {} },
  { id: 'B009_BeatingRod',          kind: 'minor', cost: {} },
  { id: 'D082_HuntingTrophy',      kind: 'minor', cost: {} },
  { id: 'E038_RodCollection',      kind: 'minor', cost: {} },
]

describe('Sprint 1 PR-1B — cost/vp BGA alignment (16 cards)', () => {
  it.each(cases)(
    '$id cost & vp',
    ({ id, kind, cost, vp }) => {
      const card =
        kind === 'occupation' ? getOccupationCard(id)
        : kind === 'direct' ? (id === 'C039_StudioBoat' ? C039_StudioBoat : undefined)
        : getMinorImprovementCard(id)
      expect(card, `card not found in catalog: ${id}`).toBeDefined()
      expect(card!.cost ?? {}).toEqual(cost)
      if (vp !== undefined) {
        expect(card!.vp, `${id} expected vp ${vp}`).toBe(vp)
      }
    },
  )
})
