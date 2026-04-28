// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isLocaleEntryComplete, getMissingLanguages } from '../LocalizationModal'

describe('isLocaleEntryComplete', () => {
  it('accepts an entry with name + at least one non-empty desc line', () => {
    expect(isLocaleEntryComplete({ name: 'foo', desc: ['bar'] })).toBe(true)
  })

  it('rejects undefined', () => {
    expect(isLocaleEntryComplete(undefined)).toBe(false)
  })

  it('rejects entries with only whitespace name', () => {
    expect(isLocaleEntryComplete({ name: '   ', desc: ['bar'] })).toBe(false)
  })

  it('rejects entries with empty desc array', () => {
    expect(isLocaleEntryComplete({ name: 'foo', desc: [] })).toBe(false)
  })

  it('rejects entries where every desc line is whitespace', () => {
    expect(isLocaleEntryComplete({ name: 'foo', desc: ['  ', '\t'] })).toBe(false)
  })

  it('accepts when prerequisite is omitted', () => {
    expect(isLocaleEntryComplete({ name: 'foo', desc: ['bar'] })).toBe(true)
  })
})

describe('getMissingLanguages', () => {
  it('returns the other supported language when only currentLang is filled', () => {
    expect(getMissingLanguages('zh', { zh: { name: '中', desc: ['描述'] } })).toEqual(['en'])
    expect(getMissingLanguages('en', { en: { name: 'foo', desc: ['bar'] } })).toEqual(['zh'])
  })

  it('returns empty when both languages are filled', () => {
    expect(
      getMissingLanguages('zh', {
        zh: { name: '中', desc: ['描述'] },
        en: { name: 'foo', desc: ['bar'] },
      }),
    ).toEqual([])
  })

  it('treats incomplete entries as missing', () => {
    expect(
      getMissingLanguages('zh', {
        zh: { name: '中', desc: ['描述'] },
        en: { name: '', desc: [] },
      }),
    ).toEqual(['en'])
  })

  it('skips currentLang even if it is missing/incomplete', () => {
    // The current language's content comes from the editor (currentContent),
    // not from `locales`, so we never schedule a translation back to it.
    expect(
      getMissingLanguages('zh', {
        en: { name: 'foo', desc: ['bar'] },
      }),
    ).toEqual([])
  })

  it('does not include unsupported languages', () => {
    // Only zh + en are wired in the UI today; getMissingLanguages should
    // not invent jobs for languages outside that set.
    const missing = getMissingLanguages('zh', {})
    expect(missing).toEqual(['en'])
  })
})
