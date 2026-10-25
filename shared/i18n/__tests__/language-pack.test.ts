import { describe, expect, it } from 'vitest'
import { cardText, registerLanguagePack, t } from '..'

describe('language package display', () => {
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
