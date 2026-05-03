import { describe, it, expect } from 'vitest'
import { extractReferencesFromSource } from '../i18n/extract-references'

describe('extractReferencesFromSource', () => {
  it('extracts t() with single string arg', () => {
    const src = `import { t } from './i18n'\nconst x = t('ui.gameTitle')`
    const r = extractReferencesFromSource('foo.ts', src)
    expect(r.static.map((s) => s.key)).toEqual(['ui.gameTitle'])
    expect(r.dynamic).toHaveLength(0)
  })

  it('extracts t(locale, key) two-arg form', () => {
    const src = `const x = t(locale, 'actions.bake.name')`
    const r = extractReferencesFromSource('foo.ts', src)
    expect(r.static.map((s) => s.key)).toEqual(['actions.bake.name'])
  })

  it('extracts *Key: literal property assignments', () => {
    const src = `
      const a = { nameKey: 'actions.foo.name' }
      const b = { descKey: 'cards.A1.desc', logKey: 'log.foo' }
      const c = { promptKey: 'prompt.bar', titleKey: 'ui.t', labelKey: 'ui.l' }
      const d = { i18nKey: 'ui.x', descriptionKey: 'ui.y' }
    `
    const r = extractReferencesFromSource('foo.ts', src)
    const keys = r.static.map((s) => s.key).sort()
    expect(keys).toEqual([
      'actions.foo.name',
      'cards.A1.desc',
      'log.foo',
      'prompt.bar',
      'ui.l',
      'ui.t',
      'ui.x',
      'ui.y',
    ])
  })

  it('treats template literals (with ${}) as dynamic', () => {
    const src = 'const x = t(`actions.${id}.name`)'
    const r = extractReferencesFromSource('foo.ts', src)
    expect(r.static).toHaveLength(0)
    expect(r.dynamic).toHaveLength(1)
    expect(r.dynamic[0].template).toContain('actions.')
  })

  it('ignores t() with non-string first arg', () => {
    const src = 'const x = t(someVar)'
    const r = extractReferencesFromSource('foo.ts', src)
    expect(r.static).toHaveLength(0)
    expect(r.dynamic).toHaveLength(0)
  })

  it('ignores property assignments where Key value is non-literal', () => {
    const src = 'const a = { nameKey: someVar }'
    const r = extractReferencesFromSource('foo.ts', src)
    expect(r.static).toHaveLength(0)
  })

  it('records file and line for each reference', () => {
    const src = "const x = t('a.b')\nconst y = t('c.d')"
    const r = extractReferencesFromSource('foo.ts', src)
    expect(r.static[0].file).toBe('foo.ts')
    expect(r.static[0].line).toBe(1)
    expect(r.static[1].line).toBe(2)
  })
})
