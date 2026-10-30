import { describe, expect, it } from 'vitest'
import { getLanguagePack, t } from '../../shared/i18n'
import type { EncyclopediaText } from '../../shared/contract/card-encyclopedia'
import { resolveEncyclopediaText } from '../../shared/projections/card-encyclopedia-text'
import { buildEncyclopediaEntries } from '../card-encyclopedia/catalog'
import { loadEncyclopediaSources } from '../card-encyclopedia/sources'

const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
const entry = (key: string) => {
  const found = entries.find((item) => item.key === key)
  if (!found) throw new Error(`missing ${key}`)
  return found
}
const render = (locale: string, parts: EncyclopediaText | undefined) =>
  parts && resolveEncyclopediaText(parts, (key, params) => t(locale, key, params))

describe('card encyclopedia text references', () => {
  it('points ordinary and major cards at the same language-pack face text as the card face', () => {
    expect(entry('card:C057_Crudite').text).toEqual({
      name: [{ key: 'cardFaces.C057_Crudite.name' }],
      body: [{ key: 'cardFaces.C057_Crudite.description' }],
    })
    expect(entry('card:A094_LazySowman').text.rules).toEqual([{ key: 'cardFaces.A094_LazySowman.rules' }])
    expect(entry('card:A039_Chapel').text.prerequisite).toEqual([{ key: 'cardFaces.A039_Chapel.prerequisite' }])
    expect(entry('major:Major_Fireplace3').text.name).toEqual([{ key: 'cardFaces.Major_Fireplace3.name' }])
  })

  it('takes English from the English pack rather than the card definition', () => {
    expect(render('en', entry('card:C057_Crudite').text.name)).toBe('Crudité')
    expect(render('zh', entry('card:C057_Crudite').text.name)).toBe('蔬菜沙拉')
    expect(render('en', entry('card:C057_Crudite').text.body)).toContain('on top of another <VEGETABLE> in a field to get 4 <FOOD>.')
  })

  it('renders parent cards from their face text', () => {
    expect(render('en', entry('parent:PR01').text.name)).toBe('Mother PR01')
    expect(render('zh', entry('parent:PR01').text.body)).toBe('在第 2 回合格上放置供应中的 1 个畜栏。该回合开始时，可以免费建造这些畜栏。')
    expect(render('zh', entry('parent:PS01').text.name)).toBe('父亲 PS01')
    expect(render('zh', entry('parent:PS01').text.body)).toBe([
      '条件 · 至少 2 块田 / 至少 3 块田 / 至少 5 块田',
      '奖励 · 获得 1 石料 / 获得 2 石料 / 获得 3 石料',
    ].join('\n'))
  })

  it('spells out special action effects per player count when the printed values differ', () => {
    const card = entry('moorSpecialAction:moor-special-1-3-work-market')
    expect(render('zh', card.text.name)).toBe('伐木 / 雇工集市 / 黑市 / 非法工作')
    expect(render('zh', card.text.body)).toBe([
      '1/3 人',
      '伐木 · 移除 1 块森林，获得 2 木材',
      '雇工集市 · 1 人 · 获得 1 食物',
      '雇工集市 · 3 人 · 获得 2 食物',
      '黑市 · 支付 1 燃料，购买 1 张小改良 · 另付改良费用',
      '非法工作 · 支付 1 食物和 1 燃料，购买 1 张主要改良 · 另付改良费用',
    ].join('\n'))
  })

  it('describes a season by its action card and board changes', () => {
    expect(render('en', entry('season:winter').text.name)).toBe('Winter')
    expect(render('en', entry('season:winter').text.body)).toBe([
      'Romantic Evening · Family growth without room',
      'even without room',
      'for 1 <FOOD> per remaining harvest, plus 2 <WOOD>',
      '-1 <CLAY> -1 <REED>',
      'Pay 1 food per plowed field',
      'Fishing: not until Round 11',
    ].join('\n'))
    expect(render('zh', entry('season:summer').text.body)).toBe([
      '农夫市场 · 犁田和/或烤面包或卖谷物',
      '犁 1 块田 和/或 烤面包 或 卖谷物 -1x <GRAIN> <ARROW> 4 <FOOD>',
      '+1 <CLAY> -1 <STONE>',
      '捕鱼：+1 食物',
      '建房间：每个房间送 1 个畜舍',
      '打零工：+1 谷物',
      '房屋不需要供暖',
    ].join('\n'))
  })

  it('references only keys that exist with text in both the English and Chinese packs', () => {
    const missing: string[] = []
    for (const item of entries.filter((candidate) => candidate.sourceKind !== 'moorStart')) {
      for (const [field, parts] of Object.entries(item.text)) {
        if (field === 'name' || field === 'body') expect(parts.length, `${item.key} ${field}`).toBeGreaterThan(0)
        for (const part of parts) {
          if (!('key' in part)) continue
          for (const locale of ['en', 'zh']) {
            if (!getLanguagePack(locale)?.messages[part.key]?.trim()) missing.push(`${locale} ${item.key} ${part.key}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })
})
