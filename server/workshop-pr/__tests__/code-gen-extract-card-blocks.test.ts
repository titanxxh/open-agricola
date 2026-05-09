import { describe, it, expect } from 'vitest'
import { extractCardDefSource, extractCardImplSource } from '../code-gen'

describe('extractCardDefSource', () => {
  it('extracts CARD_DEF top-level const declaration as source string', () => {
    const code = `const CARD_ID = 'CUSTOM_X'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'X', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID } }`
    const out = extractCardDefSource(code)
    expect(out).toContain('const CARD_ID = ')
    expect(out).toContain('const CARD_DEF = new MinorImprovement(')
    expect(out).not.toContain('const CARD_IMPL')
  })

  it('throws when CARD_DEF is missing', () => {
    const code = `const CARD_IMPL = {}`
    expect(() => extractCardDefSource(code)).toThrow(/CARD_DEF/)
  })
})

describe('extractCardImplSource', () => {
  it('extracts CARD_IMPL top-level const declaration as source string', () => {
    const code = `const CARD_ID = 'CUSTOM_X'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'X', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  effect: { id: CARD_ID, onHarvest: () => gainLeaf(CARD_ID, { food: 1 }) },
}`
    const out = extractCardImplSource(code)
    expect(out).toContain('const CARD_IMPL = {')
    expect(out).toContain('onHarvest:')
    expect(out).not.toContain('const CARD_DEF')
  })

  it('returns empty-object literal when CARD_IMPL is missing (no-effect card)', () => {
    const code = `const CARD_ID = 'CUSTOM_X'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'X', deck: 'community', number: 0, desc: [], cost: {}, vp: 1 })`
    const out = extractCardImplSource(code)
    expect(out).toBe('const CARD_IMPL = {}')
  })

  it('preserves CARD_ID const so impl can reference it', () => {
    const code = `const CARD_ID = 'CUSTOM_X'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'X', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID } }`
    const out = extractCardImplSource(code)
    expect(out).toContain(`const CARD_ID = 'CUSTOM_X'`)
  })
})
