// client/services/llm/__tests__/card-utils.test.ts
import { describe, expect, it } from 'vitest'
import { extractCardFromResponse } from '../card-utils'

const SAMPLE_WITH_LOCALES = `\`\`\`typescript
const CARD_ID = 'CUSTOM_TestCard'

const CARD_DEF = new MinorImprovement({
  id: CARD_ID,
  name: 'Test Card',
  deck: 'CUSTOM',
  number: 0,
  desc: ['Effect text in English.'],
  cost: { wood: 1 },
  vp: 0,
  implemented: true,
  locales: {
    zh: {
      name: '测试卡',
      desc: ['中文效果文本。'],
    },
  },
})

const CARD_IMPL = {}
\`\`\``

const SAMPLE_WITH_PREREQUISITE_LOCALE = `\`\`\`typescript
const CARD_ID = 'CUSTOM_AdvancedCard'

const CARD_DEF = new Occupation({
  id: CARD_ID,
  name: 'Advanced Worker',
  deck: 'CUSTOM',
  number: 0,
  desc: ['Effect line one.', 'Effect line two.'],
  cost: {},
  vp: 0,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  implemented: true,
  locales: {
    zh: {
      name: '高级工人',
      desc: ['效果第一行。', '效果第二行。'],
      prerequisite: '2 张职业卡',
    },
  },
})

const CARD_IMPL = {}
\`\`\``

const SAMPLE_WITHOUT_LOCALES = `\`\`\`typescript
const CARD_ID = 'CUSTOM_LegacyCard'

const CARD_DEF = new MinorImprovement({
  id: CARD_ID,
  name: 'Legacy Card',
  deck: 'CUSTOM',
  number: 0,
  desc: ['Old card with no locales block.'],
  cost: {},
  vp: 0,
  implemented: true,
})

const CARD_IMPL = {}
\`\`\``

describe('extractCardFromResponse — locales', () => {
  it('reads locales.zh.name and desc when present', () => {
    const result = extractCardFromResponse(SAMPLE_WITH_LOCALES)
    expect(result).not.toBeNull()
    const locales = result!.card.locales as Record<string, { name: string; desc: string[]; prerequisite?: string }> | undefined
    expect(locales?.zh).toBeDefined()
    expect(locales!.zh.name).toBe('测试卡')
    expect(locales!.zh.desc).toEqual(['中文效果文本。'])
  })

  it('reads multi-line desc array in locales.zh', () => {
    const result = extractCardFromResponse(SAMPLE_WITH_PREREQUISITE_LOCALE)
    expect(result).not.toBeNull()
    const locales = result!.card.locales as Record<string, { name: string; desc: string[]; prerequisite?: string }>
    expect(locales.zh.desc).toEqual(['效果第一行。', '效果第二行。'])
    expect(locales.zh.prerequisite).toBe('2 张职业卡')
  })

  it('omits locales field when source code has none', () => {
    const result = extractCardFromResponse(SAMPLE_WITHOUT_LOCALES)
    expect(result).not.toBeNull()
    expect(result!.card.locales).toBeUndefined()
  })

  it('keeps the English name/desc as the top-level fields', () => {
    const result = extractCardFromResponse(SAMPLE_WITH_LOCALES)
    expect(result!.card.name).toBe('Test Card')
    expect(result!.card.desc).toEqual(['Effect text in English.'])
  })
})
