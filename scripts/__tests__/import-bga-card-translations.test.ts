import { describe, expect, it } from 'vitest'
import { planBgaCardTranslations, readTranslationStrings, replaceTranslationStrings, translationProblem } from '../import-bga-card-translations'
import type { CardMeta } from '../build-cards-manifest'

const thresher: CardMeta = {
  id: 'C112_Thresher', name: 'Thresher', deck: 'C', number: 112, type: 'occupation',
  desc: ['Before using __Farmland__, buy 1 <GRAIN> for 1 <FOOD>.'],
}

describe('BGA card translation import', () => {
  it('uses the BGA card title and keeps the action name used by our board', () => {
    const result = planBgaCardTranslations({ cards: [thresher],
      current: new Map([
        ['occupations.C112_Thresher.name', '脱粒机'],
        ['occupations.C112_Thresher.description', '旧说明'],
        ['actions.farmland.name', '农田'],
        ['cards.C112_Thresher.name', '脱粒机'],
        ['cards.C112_Thresher.prompt.name', '购买谷物'],
      ]),
      english: new Map([['actions.farmland.name', 'Farmland']]),
      translations: new Map([
        ['Thresher', '打谷者'], ['Farmland', '犁田'],
        [thresher.desc![0]!, '使用__犁田__前，用1<FOOD>购买1<GRAIN>。'],
      ]),
    })
    expect(Object.fromEntries(result.changes.map(change => [change.path, change.after]))).toEqual({
      'cards.C112_Thresher.name': '打谷者',
      'occupations.C112_Thresher.description': '使用__农田__前，用1<FOOD>购买1<GRAIN>。',
      'occupations.C112_Thresher.name': '打谷者',
    })
    expect(result.issues).toEqual([])
  })

  it('retains distinct titles when BGA gives two different cards the same name', () => {
    const cards: CardMeta[] = [
      { id: 'A106_SlurrySpreader', name: 'Slurry Spreader', deck: 'A', number: 106, type: 'occupation' },
      { id: 'C071_Slurry', name: 'Slurry', deck: 'C', number: 71, type: 'minor' },
    ]
    const result = planBgaCardTranslations({ cards,
      current: new Map([['occupations.A106_SlurrySpreader.name', '粪肥散布器'], ['minorImprovements.C071_Slurry.name', '泥浆']]),
      english: new Map(), translations: new Map([['Slurry Spreader', '喷洒泥浆'], ['Slurry', '喷洒泥浆']]),
    })
    expect(result.changes).toEqual([])
    expect(result.issues.map(issue => issue.reason)).toEqual(['name-collision', 'name-collision'])
  })

  it('distinguishes existing references from imported references when major titles change', () => {
    const cards: CardMeta[] = [
      { id: 'Major_Fireplace1', name: 'Fireplace', deck: 'major', number: 1, type: 'major' },
      { id: 'Major_CookingHearth1', name: 'Cooking Hearth', deck: 'major', number: 3, type: 'major' },
      { id: 'A001_Example', name: 'Example', deck: 'A', number: 1, type: 'minor', desc: ['Use __Cooking Hearth__.'], prerequisite: 'Fireplace and Cooking Hearth' },
    ]
    const result = planBgaCardTranslations({ cards, english: new Map([['ui.hearth', 'Bake with Cooking Hearth'], ['ui.stove', 'Cooking Hearth']]),
      current: new Map([
        ['improvements.Major_Fireplace1.name', '壁炉'], ['improvements.Major_CookingHearth1.name', '炊具'],
        ['minorImprovements.A001_Example.name', '示例'], ['minorImprovements.A001_Example.description', '旧说明'],
        ['minorImprovements.A001_Example.rules', '需要__壁炉__或__炊具__。'],
        ['minorImprovements.A001_Example.prerequisite', '壁炉和灶台'],
        ['ui.hearth', '用炊具烤面包'],
        ['ui.stove', '灶台'],
      ]),
      translations: new Map([['Fireplace', '火炉'], ['Cooking Hearth', '壁炉'], ['Use __Cooking Hearth__.', '使用__壁炉__。']]),
    })
    const changes = new Map(result.changes.map(change => [change.path, change.after]))
    expect(changes.get('minorImprovements.A001_Example.description')).toBe('使用__壁炉__。')
    expect(changes.get('minorImprovements.A001_Example.rules')).toBe('需要__火炉__或__壁炉__。')
    expect(changes.get('minorImprovements.A001_Example.prerequisite')).toBe('火炉和壁炉')
    expect(changes.get('ui.hearth')).toBe('用壁炉烤面包')
    expect(changes.get('ui.stove')).toBe('壁炉')
  })

  it('rejects lost resource icons, changed costs, and missing placeholders', () => {
    expect(translationProblem('Pay 1 <FOOD>.', '支付1食物。')).toBe('icon-mismatch')
    expect(translationProblem('Pay 1 <FOOD>.', '支付2<FOOD>。')).toBe('number-mismatch')
    expect(translationProblem('Pay 1 <FOOD> for 2 <GRAIN>.', '支付2<FOOD>获得1<GRAIN>。')).toBe('resource-amount-mismatch')
    expect(translationProblem('Choose {player}.', '选择玩家。')).toBe('placeholder-mismatch')
  })

  it('aligns abbreviated oven prerequisites and old Stone Oven aliases', () => {
    const cards: CardMeta[] = [
      { id: 'Major_ClayOven', name: 'Clay Oven', deck: 'major', number: 6, type: 'major' },
      { id: 'Major_StoneOven', name: 'Stone Oven', deck: 'major', number: 7, type: 'major' },
      { id: 'C060_SmallPottersOven', name: "Small Potter's Oven", deck: 'C', number: 60, type: 'minor', prerequisite: 'Return the Clay / Stone Oven' },
    ]
    const result = planBgaCardTranslations({ cards, english: new Map(),
      current: new Map([
        ['improvements.Major_ClayOven.name', '黏土烤炉'], ['improvements.Major_StoneOven.name', '石制烤炉'],
        ['minorImprovements.C060_SmallPottersOven.prerequisite', '归还黏土烤炉/石头烤炉'],
      ]),
      translations: new Map([['Clay Oven', '砖造烤炉'], ['Stone Oven', '石造烤炉']]),
    })
    expect(result.changes.find(change => change.path.endsWith('.prerequisite'))?.after).toBe('归还砖造烤炉/石造烤炉')
  })

  it('replaces only selected string literals and escapes quotes and newlines', () => {
    const source = "export const zh = { cards: { C112_Thresher: { name: '脱粒机', prompt: '保持' } } }\n"
    const replaced = replaceTranslationStrings(source, new Map([['cards.C112_Thresher.name', "打谷者'\n选择"]]))
    expect(replaced).toBe("export const zh = { cards: { C112_Thresher: { name: '打谷者\\'\\n选择', prompt: '保持' } } }\n")
    expect(readTranslationStrings(replaced).get('cards.C112_Thresher.name')).toBe("打谷者'\n选择")
    expect(replaceTranslationStrings(replaced, new Map([['cards.C112_Thresher.name', "打谷者'\n选择"]]))).toBe(replaced)
    expect(() => replaceTranslationStrings(source, new Map([['cards.missing.name', '错误']]))).toThrow('Cannot replace absent Chinese string cards.missing.name')
  })
})
