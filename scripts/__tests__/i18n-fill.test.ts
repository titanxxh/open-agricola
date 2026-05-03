import { describe, it, expect } from 'vitest'
import {
  buildStyleSamples,
  buildBgaCandidates,
} from '../i18n-fill'

describe('buildStyleSamples', () => {
  it('groups by prefix and finds neighbors', () => {
    const flatZh = new Map([
      ['actions.foo.name', '某'],
      ['actions.bar.name', '另'],
      ['ui.title', '标'],
    ])
    const flatEn = new Map([
      ['actions.foo.name', 'Foo'],
      ['actions.bar.name', 'Bar'],
      ['ui.title', 'Title'],
    ])
    const missing = [{ key: 'actions.baz.name', locales: ['zh', 'en'] as ('zh' | 'en')[], referencedAt: ['x.ts:1'] }]
    const samples = buildStyleSamples(missing, flatZh, flatEn)
    const arr = samples.get('actions.*.name') ?? []
    expect(arr.map((s) => s.key).sort()).toEqual(['actions.bar.name', 'actions.foo.name'])
  })
})

describe('buildBgaCandidates', () => {
  it('finds BGA strings that share key tokens', () => {
    const bgaUnique = new Map([
      ['Bake bread for everyone', { count: 3, locations: ['a.php:1'] }],
      ['Plow a field', { count: 1, locations: ['b.php:1'] }],
    ])
    const missing = [{ key: 'actions.bake-bread.name', locales: ['zh'] as ('zh' | 'en')[], referencedAt: [] }]
    const cands = buildBgaCandidates(missing, bgaUnique)
    expect(cands.get('actions.bake-bread.name')).toContain('Bake bread for everyone')
  })
})
