// client/services/llm/__tests__/card-utils.test.ts
import { describe, expect, it } from 'vitest'
import { buildCardArtPrompt } from '../card-utils'

describe('buildCardArtPrompt', () => {
  it.each([
    ['occupation', 'zh'],
    ['occupation', 'en'],
    ['minor', 'zh'],
    ['minor', 'en'],
  ] as const)('requests full-bleed %s art at the target ratio in %s', (
    cardType,
    locale,
  ) => {
    const prompt = buildCardArtPrompt('a field worker', cardType, locale)

    expect(prompt).toContain('0.95:1')
    expect(prompt).not.toMatch(/512|534|537|像素|pixel/i)
    expect(prompt).not.toMatch(/金边|gold[- ]trimmed|gold border/i)
    expect(prompt).toMatch(locale === 'zh' ? /原始插画素材/ : /raw source artwork/i)
    expect(prompt).toMatch(locale === 'zh' ? /延伸到四边/ : /extend to all four edges/i)
  })
})
