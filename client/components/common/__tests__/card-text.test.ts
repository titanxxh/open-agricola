import { describe, expect, it } from 'vitest'
import { getAnyCardDisplayName, getCardDisplayText } from '../cardText'

describe('season source card names', () => {
  it.each([
    ['spring', '春季', 'Spring'],
    ['summer', '夏季', 'Summer'],
    ['autumn', '秋季', 'Autumn'],
    ['winter', '冬季', 'Winter'],
  ])('localizes %s in interactions, payments and logs', (id, chinese, english) => {
    expect(getAnyCardDisplayName('zh', `through-the-seasons:${id}`)).toContain(chinese)
    expect(getAnyCardDisplayName('en', `through-the-seasons:${id}`)).toContain(english)
    expect(getAnyCardDisplayName('zh', `through-the-seasons:${id}`)).not.toContain('through-the-seasons:')
  })
})

describe('partial card locale fallback', () => {
  it.each([{ lines: [] }, { lines: [''] }, { lines: [' ', '\n'] }])('retains each populated source field when localized lines are $lines', ({ lines }) => {
    const text = getCardDisplayText('zh', 'minor', 'CUSTOM_PartialLocale', {
      id: 'CUSTOM_PartialLocale', name: 'Source name', type: 'minor', deck: 'CUSTOM', number: 0,
      desc: ['Source description.'], rules: ['Source supplemental rule.'], prerequisite: '1 occupation',
      locales: { zh: { name: '中文卡名', desc: lines, rules: lines, prerequisite: ' ' } },
    })
    expect(text).toEqual({
      name: '中文卡名', description: 'Source description.', rules: 'Source supplemental rule.', prerequisite: '1 occupation',
    })
  })

  it('keeps valid localized fields when only another field is incomplete', () => {
    const text = getCardDisplayText('zh', 'minor', 'CUSTOM_PartialLocale', {
      id: 'CUSTOM_PartialLocale', name: 'Source name', type: 'minor', deck: 'CUSTOM', number: 0,
      desc: ['Source description.'], rules: ['Source supplemental rule.'], prerequisite: '1 occupation',
      locales: { zh: { name: '中文卡名', desc: [], rules: ['中文补充规则。'], prerequisite: '1 张职业' } },
    })
    expect(text).toEqual({
      name: '中文卡名', description: 'Source description.', rules: '中文补充规则。', prerequisite: '1 张职业',
    })
  })
})
