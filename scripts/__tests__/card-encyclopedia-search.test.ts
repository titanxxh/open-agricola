import { describe, expect, it } from 'vitest'
import { buildEncyclopediaEntries } from '../card-encyclopedia/catalog'
import { buildSearchDocuments, loadEncyclopediaLanguages, type EncyclopediaLanguage } from '../card-encyclopedia/search'
import { loadEncyclopediaSources } from '../card-encyclopedia/sources'

const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
const pick = (...keys: string[]) => keys.map((key) => {
  const found = entries.find((entry) => entry.key === key)
  if (!found) throw new Error(`missing ${key}`)
  return found
})

describe('encyclopedia search documents from injected languages', () => {
  const english: Record<string, string> = {
    'cardFaces.C057_Crudite.name': 'Crudité',
    'cardFaces.C057_Crudite.description': '[Anytime] Buy 1 <VEGETABLE> <ARROW> 3 <FOOD>.',
    'cardFaces.A085_Homekeeper.name': 'Homekeeper',
    'cardFaces.A085_Homekeeper.description': 'A __clay__ room holds 1 more person.',
    'resources.vegetable': 'Vegetable',
    'resources.food': 'Food',
    'ui.parentCard.mother': 'Mother',
  }
  const languages: EncyclopediaLanguage[] = [
    { id: 'en', messages: english, ownKeys: new Set() },
    {
      id: 'zh',
      messages: {
        ...english,
        'cardFaces.C057_Crudite.name': '蔬菜沙拉',
        'cardFaces.A085_Homekeeper.name': '女管家',
        'cardFaces.A085_Homekeeper.description': '一间__黏土__房多住 1 人。',
        'resources.vegetable': '蔬菜',
        'resources.food': '食物',
        'ui.parentCard.mother': '母亲',
      },
      ownKeys: new Set([
        'minorImprovements.C057_Crudite.name',
        'cards.A085_Homekeeper.name',
        'occupations.A085_Homekeeper.description',
        'resources.vegetable',
        'resources.food',
        'ui.parentCard.mother',
      ]),
    },
  ]
  const [crudite, homekeeper, mother] = buildSearchDocuments(
    pick('card:C057_Crudite', 'card:A085_Homekeeper', 'parent:PR01'),
    languages,
  )

  it('indexes plain bilingual text with icons named in each language', () => {
    expect(crudite).toEqual({
      key: 'card:C057_Crudite',
      identifiers: ['C057_Crudite', 'C057'],
      locales: {
        en: {
          name: { text: 'Crudité', status: 'localized' },
          body: { text: 'Anytime Buy 1 Vegetable 3 Food .', status: 'localized' },
        },
        zh: {
          name: { text: '蔬菜沙拉', status: 'localized' },
          body: { text: 'Anytime Buy 1 蔬菜 3 食物 .', status: 'fallback' },
        },
      },
      iconTerms: ['Vegetable', '蔬菜', 'Food', '食物'],
    })
  })

  it('treats a card name translated under cards.<id>.name as the language’s own text', () => {
    expect(homekeeper.locales.zh).toEqual({
      name: { text: '女管家', status: 'localized' },
      body: { text: '一间黏土房多住 1 人。', status: 'localized' },
    })
  })

  it('marks per field text that falls back to English or is missing everywhere', () => {
    expect(mother.identifiers).toEqual(['PR01'])
    expect(mother.locales).toEqual({
      en: { name: { text: 'Mother PR01', status: 'localized' }, body: { text: '', status: 'missing' } },
      zh: { name: { text: '母亲 PR01', status: 'localized' }, body: { text: '', status: 'missing' } },
    })
  })
})

describe('encyclopedia search documents from the pinned language packs', () => {
  const languages = loadEncyclopediaLanguages()
  const documents = buildSearchDocuments(entries, languages)
  const byKey = new Map(documents.map((document) => [document.key, document]))

  it('has one document per catalog entry in catalog order', () => {
    expect(languages.map((language) => language.id)).toEqual(['en', 'zh'])
    expect(documents.map((document) => document.key)).toEqual(entries.map((entry) => entry.key))
  })

  it('keeps both the stable id and the number players see', () => {
    expect(byKey.get('major:Major_Moor_VillageChurch')?.identifiers).toEqual(['Major_Moor_VillageChurch', 'M005'])
    expect(byKey.get('major:Major_Fireplace1')?.identifiers).toEqual(['Major_Fireplace1'])
  })

  it('takes English from the English pack and expands icons without typography words', () => {
    const fireplace = byKey.get('major:Major_Fireplace1')
    expect(byKey.get('card:C057_Crudite')?.locales.en.name).toEqual({ text: 'Crudité', status: 'localized' })
    expect(fireplace?.locales.en.body?.text).toBe(
      'Anytime Vegetable 2 Food Boar 2 Food Sheep 2 Food Cattle 3 Food Bake Bread action: Grain 2 Food',
    )
    expect(fireplace?.locales.zh.body?.text).toBe('随时 蔬菜 2 食物 野猪 2 食物 羊 2 食物 牛 3 食物 烤面包行动： 谷物 2 食物')
    expect(fireplace?.iconTerms).toEqual(['Vegetable', '蔬菜', 'Food', '食物', 'Boar', '野猪', 'Sheep', '羊', 'Cattle', '牛', 'Grain', '谷物'])
  })

  it('never leaks markup, raw keys or arrow words into searchable text', () => {
    const offenders = documents.flatMap((document) => Object.entries(document.locales).flatMap(([locale, fields]) =>
      Object.entries(fields)
        .filter(([, field]) => /<[A-Z0-9_-]+>|__|\[|\]|cardFaces\.|parentFaces\.|moor\.specialActions\.|\barrow\b/i.test(field.text))
        .map(([name, field]) => `${document.key} ${locale} ${name}: ${field.text}`)))
    expect(offenders).toEqual([])
  })
})
