// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { pickLocalizationCurrentContent } from '../AiCardDesigner'

describe('pickLocalizationCurrentContent', () => {
  it('uses English source content regardless of the active UI language', () => {
    const result = pickLocalizationCurrentContent({
      cardLocales: {
        zh: { name: '中文卡', desc: ['中文描述'] },
        en: { name: 'Saved English Card', desc: ['Saved English description'] },
      },
      cardName: 'Edited English Card',
      prerequisite: '',
      extractedName: 'English Card',
      extractedDesc: ['English desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('Saved English Card')
    expect(result.desc).toEqual(['Saved English description'])
  })

  it('falls back to top-level English fields when only Chinese localization exists', () => {
    const result = pickLocalizationCurrentContent({
      cardLocales: {
        zh: { name: '中文卡', desc: ['中文描述'] },
      },
      cardName: 'Edited English Card',
      prerequisite: '',
      extractedName: 'OldEnglishName',
      extractedDesc: ['Eng desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('Edited English Card')
    expect(result.desc).toEqual(['Eng desc'])
  })

  it('falls back to extracted name when both cardLocales and cardName are empty', () => {
    const result = pickLocalizationCurrentContent({
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

  it('treats an English locale entry with empty desc as missing and falls through to editor', () => {
    const result = pickLocalizationCurrentContent({
      cardLocales: {
        en: { name: 'Name only', desc: [] },
      },
      cardName: 'Editor English',
      prerequisite: '',
      extractedName: 'Eng',
      extractedDesc: ['Eng desc'],
      extractedPrerequisite: undefined,
    })
    expect(result.name).toBe('Editor English')
    expect(result.desc).toEqual(['Eng desc'])
  })

  it('prefers the English locale prerequisite when present, otherwise editor input', () => {
    const result = pickLocalizationCurrentContent({
      cardLocales: {
        en: { name: 'English', desc: ['English description'], prerequisite: 'English prerequisite' },
      },
      cardName: '',
      prerequisite: 'Editor prerequisite',
      extractedName: undefined,
      extractedDesc: undefined,
      extractedPrerequisite: 'extracted prereq',
    })
    expect(result.prerequisite).toBe('English prerequisite')

    const result2 = pickLocalizationCurrentContent({
      cardLocales: {
        en: { name: 'English', desc: ['English description'] },
      },
      cardName: '',
      prerequisite: 'Editor prerequisite',
      extractedName: undefined,
      extractedDesc: undefined,
      extractedPrerequisite: 'extracted prereq',
    })
    expect(result2.prerequisite).toBe('Editor prerequisite')
  })

  it('returns empty strings when nothing is set', () => {
    const result = pickLocalizationCurrentContent({
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
