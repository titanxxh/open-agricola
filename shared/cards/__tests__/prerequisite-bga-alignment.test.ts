import { describe, expect, it } from 'vitest'
import { getMinorImprovementCard, getOccupationCard } from '../catalog'

// BGA reference: bga-agricola/modules/php/Cards/<deck>/<id>.php $this->prerequisite
// Locked in by 2026-05-12 metadata-3b real-deviation fix.

type Case = { id: string; prerequisite: string; kind: 'minor' | 'occupation' }

// Forward 3: BGA has, TS now added
const forwardAdded: Case[] = [
  { id: 'D30_ArtisanDistrict', prerequisite: '3 Occupations', kind: 'minor' },
  { id: 'D50_ForeignAid', prerequisite: 'Play in Round 11 or Before', kind: 'minor' },
  { id: 'E38_RodCollection', prerequisite: '3 Occupations', kind: 'minor' },
]

// Wording 6: TS rewritten to match BGA exact text
const wordingFixed: Case[] = [
  { id: 'A20_DoubleTurnPlow', prerequisite: 'Play in Round 3 (5) or Before', kind: 'minor' },
  { id: 'B18_GrasslandHarrow', prerequisite: '2 Occ., 1 Resource After Payment', kind: 'minor' },
  { id: 'C35_LanternHouse', prerequisite: 'No occupation', kind: 'minor' },
  { id: 'D1_ZigzagHarrow', prerequisite: '3 Fields in an "L" Shape', kind: 'minor' },
  { id: 'E37_OxSkull', prerequisite: '1 cattle', kind: 'minor' },
  { id: 'E39_Paintbrush', prerequisite: '1 pig', kind: 'minor' },
]

// Reverse 6 (kept on OA side, BGA upstream omits — UI-only metadata)
const oaExtraKept: Case[] = [
  { id: 'A3_PaperKnife', prerequisite: '3 Occupations In Hand', kind: 'minor' },
  { id: 'B154_SheepKeeper', prerequisite: 'Less Than 7 Sheep', kind: 'occupation' },
  { id: 'B56_Brook', prerequisite: '1 Occupation', kind: 'minor' },
  { id: 'B74_ThickForest', prerequisite: '5 Clay in Your Supply', kind: 'minor' },
  { id: 'C30_HalfTimberedHouse', prerequisite: 'Stone House', kind: 'minor' },
  { id: 'C54_MarketBooth', prerequisite: '1 Stable in Reserve', kind: 'minor' },
]

const allCases: Case[] = [...forwardAdded, ...wordingFixed, ...oaExtraKept]

describe('prerequisite BGA alignment', () => {
  it.each(allCases)(
    '$id has prerequisite: $prerequisite',
    ({ id, prerequisite, kind }) => {
      const card = kind === 'occupation' ? getOccupationCard(id) : getMinorImprovementCard(id)
      expect(card, `card not found in catalog: ${id}`).toBeDefined()
      expect(card!.prerequisite).toBe(prerequisite)
    },
  )
})
