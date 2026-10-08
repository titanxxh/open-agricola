import { describe, expect, it } from 'vitest'
import { extractGenerationOutput } from '../request'

describe('structured generation messages', () => {
  for (const kind of ['capability-gap', 'clarification', 'reference-continuation']) {
    it.each(['\n', '\r', '\r\n'])(`preserves bare line breaks in ${kind}: %j`, separator => {
      const before = 'Missing "construction" hook and \\ path'
      const after = 'Keep \\n literal and \\\\ paired backslashes.'
      const message = before + separator + after
      const raw = `{"kind":"${kind}","message":${JSON.stringify(before).slice(0, -1)}${separator}${JSON.stringify(after).slice(1)}}`
      expect(extractGenerationOutput(raw)).toEqual({ kind, message })
      expect(extractGenerationOutput(`\`\`\`json\n${raw}\n\`\`\``)).toEqual({ kind, message })
    })
  }

  it('preserves already valid escapes and structural whitespace', () => {
    const output = { kind: 'clarification', message: 'A "quoted" rule.\nA literal \\n and \\ path.\r\nKeep\ttabs.' }
    expect(extractGenerationOutput(JSON.stringify(output, null, 2))).toEqual(output)
  })

  it.each([
    '{"kind":"capability-gap","message":"first\n\tsecond"}',
    '{"kind":"capability-gap","message":"first\n\u0000second"}',
    '{"kind":"capability-gap","message":"first\\\nsecond"}',
    '{"kind":"capability-gap","message":"first\nsecond}',
    '{"kind":"capability-gap","message":"first\n"second"}',
    '{"kind":"capability-gap","message":"first\nsecond",}',
    '{"kind":"capability-gap","message":"first\nsecond"} {}',
    '{"kind":"capability-gap","message":"first\nsecond"} trailing',
    '\uFEFF{"kind":"capability-gap","message":"first\nsecond"}',
    '{"kind":"candidate","message":"first\nsecond"}',
    '{"kind":"capability-gap","message":"\n\r"}',
    '{"kind":"capability-gap","message":42}',
  ])('still rejects invalid structured responses: %j', raw => {
    expect(() => extractGenerationOutput(raw)).toThrow('Expected')
  })

  it('leaves complete source bytes for authoritative code validation', () => {
    const source = 'const CARD_DEF = {}; const CARD_IMPL = {}; const broken = "first\nsecond";'
    expect(extractGenerationOutput(`\`\`\`typescript\n${source}\n\`\`\``)).toEqual({ kind: 'source', source, message: '' })
  })
})
