import { describe, expect, it } from 'vitest'
import type { EncyclopediaEntry, EncyclopediaTextField } from '../../../../shared/contract/card-encyclopedia'
import type { EncyclopediaItem } from '../encyclopedia-item'
import { queryEncyclopedia } from '../encyclopedia-query'
import { cardEntry } from './fixtures'

type Texts = Partial<Record<EncyclopediaTextField, string>>

const majorEntry = (sourceId: string): EncyclopediaEntry => {
  const entry = { ...cardEntry(sourceId, 'M000', { group: 'majorStandard', publicType: 'major', displayNumber: null }), sourceKind: 'major' as const }
  return { ...entry, key: `${entry.sourceKind}:${sourceId}` }
}

const fields = (texts: Texts) =>
  Object.fromEntries(Object.entries(texts).map(([field, text]) => [field, { text, status: 'localized' as const }]))

/** Search documents shaped like the generated ones: plain text per language, icons already named. */
const searchable = (entry: EncyclopediaEntry, en: Texts, zh: Texts, extraTerms: string[] = []): EncyclopediaItem => ({
  entry,
  document: {
    key: entry.key,
    identifiers: [entry.sourceId, ...(entry.displayNumber ? [entry.displayNumber] : [])],
    locales: { en: fields(en), zh: fields(zh) },
    extraTerms,
  },
})

const BASEBOARDS = searchable(
  cardEntry('A004_Baseboards', 'A004'),
  { name: 'Baseboards', body: 'You immediately get 1 Wood for each room you have. If you have more rooms than people, you get 1 additional Wood .' },
  { name: '护壁板', body: '你立即获得等同于你房间数量的 木材 。若你的房间数大于家庭成员数，则你再额外获得1 木材 。' },
  ['Wood', '木材', '木头'],
)
const OVEN_SITE = searchable(
  cardEntry('A027_OvenSite', 'A027'),
  { name: 'Oven Site', body: 'When you play this card, you get 2 Wood and you can immediately build the Clay Oven or Stone Oven major improvement.', prerequisite: 'Both Fireplace and Cooking Hearth' },
  { name: '烤炉区', body: '打出此卡时，你立即获得2 木材 ，并且你还可以立即支付1 黏土 +1 石料 来打出砖造烤炉或石造烤炉主要改良。', prerequisite: '火炉和壁炉两者皆有' },
  ['Wood', '木材', 'Clay', '黏土', 'Stone', '石料', '木头'],
)
const VEGETABLE_SLICER = searchable(
  cardEntry('A041_VegetableSlicer', 'A041'),
  { name: 'Vegetable Slicer', body: 'Each time you upgrade a Fireplace to a Cooking Hearth, you immediately get 2 Wood and 1 Vegetable (not retroactively).' },
  { name: '蔬果刨刀', body: '每次你将火炉升级为壁炉时，你立即获得2 木材 和1 蔬菜 （不追溯）。' },
  ['Wood', '木材', 'Vegetable', '蔬菜', '木头'],
)
const ORIENTAL_FIREPLACE = searchable(
  cardEntry('A060_OrientalFireplace', 'A060'),
  { name: 'Oriental Fireplace', body: 'Anytime Vegetable 4 Food Sheep 3 Food Cattle 5 Food Bake Bread action: Grain 2 Food' },
  { name: '东方火炉', body: '任意时间 蔬菜 4 食物 羊 3 食物 牛 5 食物 烤面包 行动: 谷物 2 食物' },
  ['Vegetable', '蔬菜', 'Food', '食物', 'Sheep', '羊', 'Cattle', '牛', 'Grain', '谷物'],
)
const COOKING_HEARTH = searchable(
  majorEntry('Major_CookingHearth1'),
  { name: 'Cooking Hearth', body: 'Anytime Vegetable 3 Food Boar 3 Food Sheep 2 Food Cattle 4 Food Bake Bread action: Grain 3 Food' },
  { name: '壁炉', body: '随时 蔬菜 3 食物 野猪 3 食物 羊 2 食物 牛 4 食物 烤面包行动： 谷物 3 食物' },
  ['Vegetable', '蔬菜', 'Food', '食物', 'Boar', '野猪', 'Sheep', '羊', 'Cattle', '牛', 'Grain', '谷物'],
)
const fireplace = (sourceId: string) => searchable(
  majorEntry(sourceId),
  { name: 'Fireplace', body: 'Anytime Vegetable 2 Food Boar 2 Food Sheep 2 Food Cattle 3 Food Bake Bread action: Grain 2 Food' },
  { name: '火炉', body: '随时 蔬菜 2 食物 野猪 2 食物 羊 2 食物 牛 3 食物 烤面包行动： 谷物 2 食物' },
  ['Vegetable', '蔬菜', 'Food', '食物', 'Boar', '野猪', 'Sheep', '羊', 'Cattle', '牛', 'Grain', '谷物'],
)
const FIREPLACE_1 = fireplace('Major_Fireplace1')
const FIREPLACE_2 = fireplace('Major_Fireplace2')

/** Default catalog order. */
const CATALOG = [BASEBOARDS, OVEN_SITE, VEGETABLE_SLICER, ORIENTAL_FIREPLACE, COOKING_HEARTH, FIREPLACE_1, FIREPLACE_2]

const ids = (query: string, items: readonly EncyclopediaItem[] = CATALOG) =>
  queryEncyclopedia(items, query).map(item => item.entry.sourceId)

describe('queryEncyclopedia', () => {
  it('keeps the whole catalog in its default order for an empty or blank query', () => {
    expect(queryEncyclopedia(CATALOG, '')).toEqual(CATALOG)
    expect(queryEncyclopedia(CATALOG, '  \t ')).toEqual(CATALOG)
  })

  it('finds every entity with an English name, whatever the interface language, and a Chinese name too', () => {
    expect(ids('Oriental')).toEqual(['A060_OrientalFireplace'])
    expect(ids('东方')).toEqual(['A060_OrientalFireplace'])
    expect(ids('Fireplace')).toContain('Major_Fireplace2')
    expect(ids('Fireplace')).toContain('Major_Fireplace1')
  })

  it('ignores letter case, accents and full-width forms in numbers and English', () => {
    const crudite = searchable(
      cardEntry('C057_Crudite', 'C057'),
      { name: 'Crudité', body: 'When you play this card, you can immediately buy exactly 1 Vegetable for 3 Food .' },
      { name: '蔬菜沙拉', body: '打出本牌时，你可立即用 3 食物 购买恰好 1 蔬菜 。' },
    )
    const items = [...CATALOG, crudite]
    for (const query of ['oriental', 'ORIENTAL', 'oRiEnTaL', 'ＯＲＩＥＮＴＡＬ']) expect(ids(query, items)).toEqual(['A060_OrientalFireplace'])
    for (const query of ['a004', 'A004', 'Ａ００４']) expect(ids(query, items)).toEqual(['A004_Baseboards'])
    for (const query of ['crudite', 'CRUDITÉ', 'Crudité']) expect(ids(query, items)).toEqual(['C057_Crudite'])
  })

  it('needs every word in one entry, from any field and either language', () => {
    expect(ids('baseboards 木材')).toEqual(['A004_Baseboards'])
    expect(ids('a027 cooking')).toEqual(['A027_OvenSite'])
    expect(ids('木头 蔬菜')).toEqual(['A041_VegetableSlicer'])
    expect(ids('木头　蔬菜 ')).toEqual(['A041_VegetableSlicer'])
    expect(ids('木头 蔬菜 baseboards')).toEqual([])
  })

  it('matches a Chinese phrase without spaces as one word, across the spacing around icon names', () => {
    expect(ids('房间数量')).toEqual(['A004_Baseboards'])
    expect(ids('数量的木材')).toEqual(['A004_Baseboards'])
    expect(ids('获得2木材')).toEqual(['A027_OvenSite', 'A041_VegetableSlicer'])
    expect(ids('房间木材')).toEqual([])
  })

  it('does not treat typography between words as something to find', () => {
    expect(ids('vegetable · wood')).toEqual(ids('vegetable wood'))
    expect(ids('oriental / fireplace')).toEqual(['A060_OrientalFireplace'])
    expect(ids('·')).toEqual(ids(''))
  })

  it('ranks an exact number or id before text that happens to mention it', () => {
    const mentionsA004 = searchable(
      cardEntry('A003_NumberMention', 'A003'),
      { name: 'Number Mention', body: 'Rules text that names A004 and A004_Baseboards.' },
      { name: '提到编号', body: '提到 A004 的规则文字。' },
    )
    const items = [mentionsA004, ...CATALOG]
    expect(ids('A004', items)).toEqual(['A004_Baseboards', 'A003_NumberMention'])
    expect(ids('a004_baseboards', items)).toEqual(['A004_Baseboards', 'A003_NumberMention'])
  })

  it('ranks a complete name, then part of a name, then card text, keeping catalog order within a rank', () => {
    expect(ids('fireplace')).toEqual(['Major_Fireplace1', 'Major_Fireplace2', 'A060_OrientalFireplace', 'A027_OvenSite', 'A041_VegetableSlicer'])
    expect(ids('火炉')).toEqual(['Major_Fireplace1', 'Major_Fireplace2', 'A060_OrientalFireplace', 'A027_OvenSite', 'A041_VegetableSlicer'])
    expect(ids('Cooking  Hearth')).toEqual(['Major_CookingHearth1', 'A027_OvenSite', 'A041_VegetableSlicer'])
  })

  it('ranks a multi-word query by the best field any of its words reaches', () => {
    expect(ids('fireplace vegetable')).toEqual(['Major_Fireplace1', 'Major_Fireplace2', 'A041_VegetableSlicer', 'A060_OrientalFireplace'])
  })
})
