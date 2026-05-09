import { describe, it, expect } from 'vitest'
import { extractExamplesFromMarkdown } from '../examples-extract'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const md = readFileSync(resolve(__dirname, '../../../docs/community-card-examples.md'), 'utf-8')

describe('extractExamplesFromMarkdown', () => {
  it('returns exactly 10 examples', () => {
    const examples = extractExamplesFromMarkdown(md)
    expect(examples).toHaveLength(10)
  })

  it('each example has id, sectionTitle, code with both CARD_DEF and CARD_IMPL', () => {
    const examples = extractExamplesFromMarkdown(md)
    for (const ex of examples) {
      expect(ex.id).toMatch(/^CUSTOM_/)
      expect(ex.sectionTitle).toBeTruthy()
      expect(ex.code).toContain('CARD_DEF')
      expect(ex.code).toContain('CARD_IMPL')
      expect(ex.cardType).toMatch(/^(minor|occupation)$/)
    }
  })

  it('first example is the SimpleHut from §1', () => {
    const examples = extractExamplesFromMarkdown(md)
    expect(examples[0]!.id).toBe('CUSTOM_SimpleHut')
    expect(examples[0]!.sectionTitle).toContain('极简纯分数卡')
  })
})
