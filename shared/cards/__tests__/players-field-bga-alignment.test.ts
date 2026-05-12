import { describe, expect, it } from 'vitest'
import { getOccupationCard } from '../catalog'

// All 10 P0 occupations in this batch.
// BGA reference: bga-agricola/modules/php/Cards/<deck>/<id>_*.php $this->players
const cases: Array<{ id: string; expected: string }> = [
  { id: 'A154_Paymaster', expected: '4+' },
  { id: 'A158_CulinaryArtist', expected: '4+' },
  { id: 'A160_Lutenist', expected: '4+' },
  { id: 'C134_CowPrince', expected: '3+' },
  { id: 'C151_SowingDirector', expected: '4+' },
  { id: 'C152_Puppeteer', expected: '4+' },
  { id: 'C153_PatternMaker', expected: '4+' },
  { id: 'C158_ForestCampaigner', expected: '4+' },
  { id: 'C163_MaterialDeliveryman', expected: '4+' },
  { id: 'E154_Margrave', expected: '4+' },
  { id: 'A133_Braggart', expected: '3+' },
  { id: 'A134_FullFarmer', expected: '3+' },
  { id: 'B132_EstateMaster', expected: '3+' },
  { id: 'B153_Housemaster', expected: '4+' },
  { id: 'D128_BuildingTycoon', expected: '3+' },
  { id: 'D149_CasualWorker', expected: '4+' },
]

describe('Sprint 1 PR-1A — players field BGA alignment (10 occupations)', () => {
  it.each(cases)(
    '$id players field equals $expected',
    ({ id, expected }) => {
      const card = getOccupationCard(id)
      expect(card, `card not found in catalog: ${id}`).toBeDefined()
      expect(card!.players).toBe(expected)
    },
  )
})
