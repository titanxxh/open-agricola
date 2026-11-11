import { describe, expect, it } from 'vitest'
import { buildEncyclopediaEntries } from '../card-encyclopedia/catalog'
import { loadEncyclopediaSources } from '../card-encyclopedia/sources'

const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
const scan = entries.filter((entry) => entry.sourceKind === 'scan')
const byId = new Map(scan.map((entry) => [entry.sourceId, entry]))

describe('scan cards in the encyclopedia catalog', () => {
  it('loads every scanned face and none of the backs', () => {
    expect(scan).toHaveLength(98)
    expect(scan.every((entry) => entry.face.kind === 'scan')).toBe(true)
    expect(scan.map((entry) => entry.key)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^scan:back-/)]))
  })

  it('keeps the reused skins on the printed card types and the new layouts off them', () => {
    expect(byId.get('L001_BeanFarmer')).toMatchObject({
      group: 'L',
      publicType: 'occupation',
      displayNumber: 'L001',
      players: { minimum: 3 },
      face: { kind: 'scan', cardId: 'L001_BeanFarmer' },
    })
    expect(byId.get('X07_LeyLines')).toMatchObject({
      group: 'X', publicType: 'alienArtifact', displayNumber: 'X07', cost: { kind: 'notApplicable' },
    })
    expect(byId.get('X08_StrangeAlienEnergy')?.score).toMatchObject({ fixed: -3 })
    expect(scan.filter((entry) => entry.score.extraVp).map((entry) => entry.sourceId).sort())
      .toEqual(['X07_LeyLines', 'X12_FurryFriends', 'X17_CandyTrail'])
    expect(scan.filter((entry) => entry.publicType === 'minor').map((entry) => entry.sourceId))
      .not.toEqual(expect.arrayContaining(['X07_LeyLines', 'X08_StrangeAlienEnergy', 'X12_FurryFriends']))
    expect(byId.get('L089_Bear')).toMatchObject({ group: 'L', publicType: 'major', displayNumber: 'L089' })
    expect(byId.get('FE15_TheNobleKnight')).toMatchObject({ group: 'legendairyForest', publicType: 'occupation', displayNumber: '15' })
    for (const id of ['X03_Transmogrifier', 'X06_MerchantsOfPluto', 'FE01_TheLadyOfTheLakePt1', 'LE03_WanderingCarpenters', 'WB03_CaveGoblin']) {
      expect(['occupation', 'minor', 'major']).not.toContain(byId.get(id)?.publicType)
    }
    expect(byId.get('X03_Transmogrifier')?.publicType).toBe('illustratedAction')
    expect(byId.get('X06_MerchantsOfPluto')).toMatchObject({ publicType: 'spaceMerchant', score: { fixed: 2 } })
    expect(byId.get('X13_SpaceDinerAtTheEndOfTheGalaxy')?.publicType).toBe('alienEvent')
    expect(byId.get('FE01_TheLadyOfTheLakePt1')?.publicType).toBe('event')
    expect(scan.filter((entry) => entry.publicType === 'event' && entry.score.fixed !== null)
      .map((entry) => [entry.sourceId, entry.score.fixed])).toEqual([['FE03_TheUnicornPt2', -3]])
    expect(byId.get('FE26_PeruvianInquisition')?.text.body).toEqual([
      { literal: expect.stringContaining('During scoring, llamas score as follows for all players:\n0 llama → -1 point') },
    ])
    expect(byId.get('LE01_PetLovers')?.publicType).toBe('globalEvent')
    expect(byId.get('WB03_CaveGoblin')?.publicType).toBe('offspring')
    expect(byId.get('X23_CropCircles')).toMatchObject({ group: 'X', publicType: 'alienEvent' })
    expect(scan.filter((entry) => entry.publicType === 'alienEvent')).toHaveLength(11)
    expect(scan.filter((entry) => entry.publicType === 'spaceMerchant')).toHaveLength(3)
    expect(scan.filter((entry) => entry.publicType === 'event')).toHaveLength(13)
    expect(scan.filter((entry) => entry.publicType === 'alienArtifact')).toHaveLength(6)
    expect(byId.get('guest_Rabbit')).toMatchObject({ group: 'newdale', publicType: 'guest' })
    expect(byId.get('newdale_rules')?.publicType).toBe('expansionRules')
    expect(byId.get('FE21_TheRoadNotTaken')?.publicType).toBe('illustratedAction')
    expect(byId.has('reference_changelings')).toBe(false)
  })

  it('lists the Forest cards in printed order', () => {
    expect(scan.filter((entry) => entry.group === 'legendairyForest').map((entry) => entry.displayNumber))
      .toEqual(Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, '0')))
  })
})
