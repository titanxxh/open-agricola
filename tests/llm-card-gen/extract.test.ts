import { describe, expect, it } from 'vitest'
import { extractCardCode, rewriteCardId, ExtractError } from './extract'

describe('extractCardCode', () => {
  it('extracts the typescript fence block containing CARD_DEF + CARD_IMPL', () => {
    const response = `
Sure, here's the implementation:

\`\`\`typescript
const CARD_ID = 'CUSTOM_FOO'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Foo' })
const CARD_IMPL = { effect: { id: CARD_ID } }
\`\`\`

Hope this helps!
`
    const code = extractCardCode(response)
    expect(code).toContain('CARD_ID')
    expect(code).toContain('CARD_DEF')
    expect(code).toContain('CARD_IMPL')
  })

  it('also accepts ```ts fence', () => {
    const response = `\`\`\`ts\nconst CARD_DEF = {}\nconst CARD_IMPL = {}\n\`\`\``
    expect(() => extractCardCode(response)).not.toThrow()
  })

  it('throws when no fence present', () => {
    expect(() => extractCardCode('no code here')).toThrow(ExtractError)
  })

  it('throws when no fence has both CARD_DEF and CARD_IMPL', () => {
    const response = `\`\`\`typescript\nconst CARD_DEF = {}\n\`\`\``
    expect(() => extractCardCode(response)).toThrow(ExtractError)
  })
})

describe('rewriteCardId', () => {
  it('rewrites CARD_ID literal', () => {
    const code = `const CARD_ID = 'OLD_ID'\nconst CARD_DEF = { id: CARD_ID }`
    const rewritten = rewriteCardId(code, 'NEW_ID')
    expect(rewritten).toContain(`CARD_ID = 'NEW_ID'`)
    expect(rewritten).not.toContain('OLD_ID')
  })

  it('falls back to id field inside CARD_DEF when no CARD_ID literal', () => {
    const code = `const CARD_DEF = { id: 'OLD_ID', name: 'X' }\nconst CARD_IMPL = {}`
    const rewritten = rewriteCardId(code, 'NEW_ID')
    expect(rewritten).toContain(`id: 'NEW_ID'`)
    expect(rewritten).not.toContain('OLD_ID')
  })
})
