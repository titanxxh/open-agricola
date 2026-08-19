import { describe, it, expect } from 'vitest'
import { buildTranslatePrompt, parseTranslateResponse } from '../i18n/llm-translate'
import type { MissingKey } from '../i18n-audit'

describe('buildTranslatePrompt', () => {
  it('includes style samples and reference candidates', () => {
    const missing: MissingKey[] = [
      { key: 'actions.bake.name', locales: ['zh', 'en'], referencedAt: ['a.ts:1'] },
    ]
    const styleSamples = new Map<string, Array<{ key: string; zh: string; en: string }>>([
      ['actions.*.name', [{ key: 'actions.foo.name', zh: '某行动', en: 'Foo' }]],
    ])
    const referenceCandidates = new Map<string, string[]>([
      ['actions.bake.name', ['Bake bread']],
    ])
    const prompt = buildTranslatePrompt(missing, styleSamples, referenceCandidates)
    expect(prompt).toContain('actions.bake.name')
    expect(prompt).toContain('Bake bread')
    expect(prompt).toContain('某行动')
    expect(prompt).toContain('JSON')
  })
})

describe('parseTranslateResponse', () => {
  it('parses strict JSON', () => {
    const res = '{"actions.bake.name": {"zh": "烤面包", "en": "Bake Bread"}}'
    const r = parseTranslateResponse(res)
    expect(r.get('actions.bake.name')).toEqual({ zh: '烤面包', en: 'Bake Bread' })
  })

  it('extracts JSON from markdown fence', () => {
    const res = '```json\n{"a": {"zh": "x", "en": "y"}}\n```'
    const r = parseTranslateResponse(res)
    expect(r.get('a')).toEqual({ zh: 'x', en: 'y' })
  })

  it('throws on malformed', () => {
    expect(() => parseTranslateResponse('not json')).toThrow()
  })
})
