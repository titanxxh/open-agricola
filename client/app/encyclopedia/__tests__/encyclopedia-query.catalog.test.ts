import { describe, expect, it } from 'vitest'
import { buildEncyclopediaEntries } from '../../../../scripts/card-encyclopedia/catalog'
import { buildSearchDocuments, loadEncyclopediaLanguages } from '../../../../scripts/card-encyclopedia/search'
import { loadEncyclopediaSources } from '../../../../scripts/card-encyclopedia/sources'
import { queryEncyclopedia } from '../encyclopedia-query'

const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
const documents = buildSearchDocuments(entries, loadEncyclopediaLanguages())
const items = entries.map((entry, index) => ({ entry, document: documents[index] }))

const ids = (query: string) => queryEncyclopedia(items, query).map(item => item.entry.sourceId)

describe('queryEncyclopedia on the generated bilingual search documents', () => {
  it('keeps the three Fireplace entities first, then names and text that mention it', () => {
    const expected = [
      'Major_Fireplace1',
      'Major_Fireplace2',
      'Major_Fireplace3',
      'A060_OrientalFireplace',
      'A027_OvenSite',
      'A041_VegetableSlicer',
      'A139_HollowWarden',
      'C075_Firewood',
      'D025_WitchesDanceFloor',
      'M106_HorseButchery',
      'M107_PotRoastRecipe',
    ]
    expect(ids('fireplace')).toEqual(expected)
    expect(ids('FIREPLACE')).toEqual(expected)
    expect(ids('fireplace vegetable')).toEqual(['Major_Fireplace1', 'Major_Fireplace2', 'Major_Fireplace3', 'A041_VegetableSlicer', 'A060_OrientalFireplace'])
  })

  it('finds a Moor major improvement by the number printed on it', () => {
    expect(ids('M005')).toEqual(['Major_Moor_VillageChurch'])
    expect(ids('m005')).toEqual(['Major_Moor_VillageChurch'])
  })

  it('finds the same wood cards by 木头 as by 木材, and 马厩 reaches every 畜栏 card', () => {
    const byAlias = ids('木头')
    expect(byAlias).toEqual(expect.arrayContaining(['A004_Baseboards', 'B015_CarpentersBench']))
    expect([...byAlias].sort()).toEqual([...ids('木材')].sort())
    expect(ids('wood')).toEqual(expect.arrayContaining(['A004_Baseboards', 'B015_CarpentersBench']))
    expect(ids('马厩')).toEqual(expect.arrayContaining([...ids('畜栏'), 'A001_Shelter']))
    expect(ids('木头 食物')).not.toContain('A004_Baseboards')
    expect(ids('木头 食物')).toContain('A028_ForestSchool')
  })

  it('never matches the arrow icon or the CSS class behind an icon', () => {
    expect(ids('arrow')).toEqual(['A105_BarrowPusher', 'B018_GrasslandHarrow', 'D001_ZigzagHarrow', 'D017_DrillHarrow', 'M127_Wheelbarrow'])
    expect(ids('res-icon-wood')).toEqual([])
  })
})
