import { describe, expect, it } from 'vitest'
import { parseWhatsNew, whatsNewText } from '../whats-new'

const release = (version: string, date: string, items: unknown[] = [{ zh: '新功能', en: 'New feature' }]) => ({ version, date, items })

describe('parseWhatsNew', () => {
  it('keeps newest-first releases, including same-day releases in file order', () => {
    const notes = { releases: [release('v0.11.9', '2026-11-02'), release('v0.11.8', '2026-10-31'), release('v0.11.7', '2026-10-31', [{ zh: '只写中文' }])] }
    expect(parseWhatsNew(notes)).toEqual(notes)
  })

  it.each([
    [{ releases: [], extra: true }, 'Expected { "releases": [...] }'],
    [{ releases: [{ ...release('v1', '2026-11-02'), title: 'x' }] }, 'releases[0]: expected only version, date and items'],
    [{ releases: [release(' v1', '2026-11-02')] }, 'releases[0].version'],
    [{ releases: [release('v1', '2026-11-02'), release('v1', '2026-11-01')] }, 'releases[1].version: duplicate v1'],
    [{ releases: [release('v1', '2026-02-30')] }, 'releases[0].date: expected YYYY-MM-DD'],
    [{ releases: [release('v1', '2026-11-02', [])] }, 'releases[0].items: expected 1-30 notes'],
    [{ releases: [release('v1', '2026-11-02', [{}])] }, 'releases[0].items[0]: expected { "<language>": "<text>" }'],
    [{ releases: [release('v1', '2026-11-02', [{ ZH: '中文' }])] }, 'releases[0].items[0]: invalid language id ZH'],
    [{ releases: [release('v1', '2026-11-02', [{ zh: '第一行\n第二行' }])] }, 'releases[0].items[0].zh: expected 1-500 characters on one line'],
    [{ releases: [release('v1', '2026-11-02', [{ en: 'x'.repeat(501) }])] }, 'releases[0].items[0].en'],
    [{ releases: [release('v1', '2026-10-01'), release('v2', '2026-10-02')] }, 'releases[1].date: list releases newest first'],
  ])('rejects %j naming the offending field', (value, message) => {
    expect(() => parseWhatsNew(value)).toThrow(message)
  })
})

describe('whatsNewText', () => {
  it('prefers the viewer language, then English, then the first language written', () => {
    expect(whatsNewText({ zh: '中文', en: 'English' }, 'zh')).toBe('中文')
    expect(whatsNewText({ zh: '中文', en: 'English' }, 'fr')).toBe('English')
    expect(whatsNewText({ zh: '中文' }, 'en')).toBe('中文')
    expect(whatsNewText({ zh: '中文' }, 'constructor')).toBe('中文')
  })
})
