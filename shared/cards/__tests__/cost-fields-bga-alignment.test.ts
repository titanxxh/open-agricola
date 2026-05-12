import { describe, expect, it } from 'vitest'
import { getMinorImprovementCard, getOccupationCard } from '../catalog'
import { C39_StudioBoat } from '../../cards-display/C/C39_StudioBoat'

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
  { id: 'A38_WoolBlankets',        kind: 'minor', cost: {} },
  { id: 'B4_WoodPile',             kind: 'minor', cost: {} },
  { id: 'B42_ForestInn',           kind: 'minor', cost: { clay: 1, reed: 1 }, vp: 1 },
  { id: 'C3_CarriageTrip',         kind: 'minor', cost: {} },
  { id: 'C30_HalfTimberedHouse',   kind: 'minor', cost: { wood: 1, clay: 1, stone: 2, reed: 1 } },
  { id: 'C33_GreeningPlan',        kind: 'minor', cost: { food: 3 } },
  { id: 'C35_LanternHouse',        kind: 'minor', cost: { wood: 1 } },
  { id: 'C39_StudioBoat',          kind: 'direct', cost: { wood: 1 } },
  { id: 'C48_Farmstead',           kind: 'minor', cost: {} },
  { id: 'C59_SchnappsDistillery',  kind: 'minor', cost: { stone: 2, vegetable: 1 } },
  { id: 'D24_BrotherlyLove',       kind: 'minor', cost: { food: 1 } },
  { id: 'D29_MuckRake',            kind: 'minor', cost: { wood: 1 } },
  { id: 'D39_TruffleSlicer',       kind: 'minor', cost: { wood: 1 } },
  { id: 'E32_Nave',                kind: 'minor', cost: { stone: 2, reed: 1 } },
  { id: 'E34_LandRegister',        kind: 'minor', cost: { wood: 1 } },
  { id: 'E95_Miller',              kind: 'occupation', cost: {} },
  { id: 'A39_Chapel',             kind: 'minor', cost: { wood: 3, clay: 2 }, vp: 3 },
]

describe('Sprint 1 PR-1B — cost/vp BGA alignment (16 cards)', () => {
  it.each(cases)(
    '$id cost & vp',
    ({ id, kind, cost, vp }) => {
      const card =
        kind === 'occupation' ? getOccupationCard(id)
        : kind === 'direct' ? (id === 'C39_StudioBoat' ? C39_StudioBoat : undefined)
        : getMinorImprovementCard(id)
      expect(card, `card not found in catalog: ${id}`).toBeDefined()
      expect(card!.cost ?? {}).toEqual(cost)
      if (vp !== undefined) {
        expect(card!.vp, `${id} expected vp ${vp}`).toBe(vp)
      }
    },
  )
})
