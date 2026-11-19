import { describe, expect, it } from 'vitest'
import { cardText, registerLanguagePack, t } from '..'

describe('language package display', () => {
  it('recognizes known lowercase icons on classic source and translated faces', () => {
    const source = { name: 'Classic card', desc: ['Gain 1 <sheep>.'], rules: ['Spend 1 <food>.'] }
    registerLanguagePack({ version: 1, locale: 'classic-fixture', messages: {
      'cardFaces.CE001_Fixture.name': '旧版卡牌',
      'cardFaces.CE001_Fixture.description': '获得 1 <sheep> 和 2 <FOOD>。',
    } })

    expect(cardText('classic-source', 'CE001_Fixture', source).description).toBe('Gain 1 <SHEEP>.')
    expect(cardText('classic-fixture', 'CE001_Fixture', source).description).toBe('获得 1 <SHEEP> 和 2 <FOOD>。')
    expect(cardText('classic-fixture', 'CE001_Fixture', source).rules).toBe('Spend 1 <FOOD>.')
    expect(cardText('classic-source', 'E001_Fixture', source).description).toBe('Gain 1 <sheep>.')
  })

  it('uses the package for published CUSTOM_ cards and explicitly scopes an edited preview', () => {
    registerLanguagePack({ version: 1, locale: 'community-fixture', messages: {
      'cardFaces.CUSTOM_Published.name': 'Published translation',
    } })
    expect(cardText('community-fixture', 'CUSTOM_Published', { name: 'Source name' }).name).toBe('Published translation')
    expect(cardText('community-fixture', 'CUSTOM_Published', { authored: true, name: 'Edited preview' }).name).toBe('Edited preview')
    expect(cardText('community-fixture', 'CUSTOM_Published').name).toBe('Published translation')
  })
  it('keeps dynamic drafts scoped and preserves partially translated fields', () => {
    registerLanguagePack({ version: 1, locale: 'scope-fixture', messages: { 'ui.title': 'Farm' } })
    const source = { name: 'Source', desc: ['Original description'], rules: ['Original rule'],
      locales: { 'scope-fixture': { name: 'Local', rules: ['Local rule'] } } }
    expect(cardText('scope-fixture', 'CUSTOM_Same', source)).toEqual({
      name: 'Local', description: 'Original description', rules: 'Local rule', prerequisite: undefined,
    })
    expect(cardText('scope-fixture', 'CUSTOM_Same', { name: 'Another draft' }).name).toBe('Another draft')
    expect(cardText('scope-fixture', 'CUSTOM_Same', source).name).toBe('Local')
    expect(t('scope-fixture', 'cardFaces.CUSTOM_Same.name')).toBe('cardFaces.CUSTOM_Same.name')
  })
})
