// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { pickLocalizationCurrentContent } from '../AiCardDesigner'

describe('pickLocalizationCurrentContent', () => {
  it('uses cardLocales[locale] when an entry exists for the active UI language', () => {
    const result = pickLocalizationCurrentContent({
      locale: 'zh',
      cardLocales: {
        zh: { name: '中文卡', desc: ['中文描述'] },
      },
      cardName: 'English Card',
      prerequisite: '',
      extractedName: 'English Card',
      extractedDesc: ['English desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('中文卡')
    expect(result.desc).toEqual(['中文描述'])
  })

  it('falls back to editor cardName when no locale entry exists yet (user just renamed in editor)', () => {
    const result = pickLocalizationCurrentContent({
      locale: 'zh',
      cardLocales: {},
      cardName: '我刚改的中文名',
      prerequisite: '',
      extractedName: 'OldEnglishName',
      extractedDesc: ['Eng desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('我刚改的中文名')
    expect(result.desc).toEqual(['Eng desc'])
  })

  it('falls back to extracted name when both cardLocales and cardName are empty', () => {
    const result = pickLocalizationCurrentContent({
      locale: 'en',
      cardLocales: {},
      cardName: '',
      prerequisite: '',
      extractedName: 'GeneratedName',
      extractedDesc: ['Auto desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('GeneratedName')
    expect(result.desc).toEqual(['Auto desc'])
  })

  it('treats a locale entry with empty desc as missing and falls through to editor', () => {
    const result = pickLocalizationCurrentContent({
      locale: 'zh',
      cardLocales: {
        zh: { name: '只有名字', desc: [] },
      },
      cardName: '编辑器里的中文',
      prerequisite: '',
      extractedName: 'Eng',
      extractedDesc: ['Eng desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('编辑器里的中文')
    expect(result.desc).toEqual(['Eng desc'])
  })

  it('prefers the locale entry prerequisite when present, otherwise editor input', () => {
    const result = pickLocalizationCurrentContent({
      locale: 'zh',
      cardLocales: {
        zh: { name: '中', desc: ['中描述'], prerequisite: '中文前置' },
      },
      cardName: '',
      prerequisite: '编辑器前置',
      extractedName: undefined,
      extractedDesc: undefined,
      extractedPrerequisite: 'extracted prereq',
    })
    expect(result.prerequisite).toBe('中文前置')

    const result2 = pickLocalizationCurrentContent({
      locale: 'zh',
      cardLocales: {
        zh: { name: '中', desc: ['中描述'] },
      },
      cardName: '',
      prerequisite: '编辑器前置',
      extractedName: undefined,
      extractedDesc: undefined,
      extractedPrerequisite: 'extracted prereq',
    })
    expect(result2.prerequisite).toBe('编辑器前置')
  })

  it('returns empty strings when nothing is set', () => {
    const result = pickLocalizationCurrentContent({
      locale: 'en',
      cardLocales: {},
      cardName: '',
      prerequisite: '',
      extractedName: undefined,
      extractedDesc: undefined,
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('')
    expect(result.desc).toEqual([])
    expect(result.prerequisite).toBeUndefined()
  })
})
