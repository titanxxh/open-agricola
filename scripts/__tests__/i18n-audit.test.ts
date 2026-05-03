import { describe, it, expect } from 'vitest'
import { computeAuditResult } from '../i18n-audit'

describe('computeAuditResult', () => {
  it('reports missing keys per locale', () => {
    const flatZh = new Map([['ui.foo', '中文'], ['ui.bar', '中文 2']])
    const flatEn = new Map([['ui.foo', 'foo']])
    const refs = [
      { key: 'ui.foo', file: 'a.ts', line: 1 },
      { key: 'ui.bar', file: 'b.ts', line: 2 },
      { key: 'ui.qux', file: 'c.ts', line: 3 },
    ]
    const r = computeAuditResult(refs, flatZh, flatEn)
    const byKey = new Map(r.missing.map((m) => [m.key, m]))
    expect(byKey.get('ui.foo')).toBeUndefined()
    expect(byKey.get('ui.bar')?.locales).toEqual(['en'])
    expect(byKey.get('ui.qux')?.locales).toEqual(['en', 'zh'])
    expect(r.missing.length).toBe(2)
  })

  it('aggregates references for the same key', () => {
    const refs = [
      { key: 'ui.x', file: 'a.ts', line: 1 },
      { key: 'ui.x', file: 'b.ts', line: 2 },
    ]
    const r = computeAuditResult(refs, new Map(), new Map())
    expect(r.missing[0].referencedAt).toEqual(['a.ts:1', 'b.ts:2'])
  })
})
