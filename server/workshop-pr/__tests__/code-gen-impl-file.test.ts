import { describe, it, expect } from 'vitest'
import { generateImplFile } from '../code-gen'

describe('generateImplFile', () => {
  it('imports display const + CardImpl type + only used helpers', () => {
    const wcard = {
      id: 'wc1',
      card_id: 'CUSTOM_Foo',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_Foo'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Foo', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID, onHarvest: () => gainLeaf(CARD_ID, { food: 2 }) } }
`.trim(),
    }
    const out = generateImplFile(wcard, {
      githubLogin: 'gh',
      iso: '2026-05-09T00:00:00Z',
    })
    expect(out).toContain(
      `import { CUSTOM_Foo } from '../../cards-display/community/CUSTOM_Foo'`,
    )
    expect(out).toContain(`export { CUSTOM_Foo }`)
    expect(out).toContain(`import type { CardImpl } from '../registry'`)
    expect(out).toContain(`import { gainLeaf } from '../helpers/pay-gain-node'`)
    expect(out).not.toContain(`import { payLeaf }`)
    expect(out).toContain(`const CARD_IMPL`)
    expect(out).toContain(`export const CUSTOM_Foo_impl = CARD_IMPL satisfies CardImpl`)
    expect(out).not.toContain(`new MinorImprovement(`)
    expect(out).not.toContain(`new Occupation(`)
  })

  it('emits empty CARD_IMPL when sandbox source has none', () => {
    const wcard = {
      id: 'wc2',
      card_id: 'CUSTOM_Hut',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_Hut'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Hut', deck: 'community', number: 0, desc: [], cost: { wood: 1 }, vp: 1 })
`.trim(),
    }
    const out = generateImplFile(wcard, {
      githubLogin: 'gh',
      iso: '2026-05-09T00:00:00Z',
    })
    expect(out).toContain(`const CARD_IMPL = {}`)
    expect(out).toContain(`export const CUSTOM_Hut_impl = CARD_IMPL satisfies CardImpl`)
  })

  it('underscores unused listener handler params (TS6133 prevention)', () => {
    const wcard = {
      id: 'wc-unused',
      card_id: 'CUSTOM_FlatDiscount',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_FlatDiscount'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Discount', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['improvement-any'],
      phases: ['computeCosts'],
      handler: (context) => ({ costs: { stone: -1 }, sourceCard: CARD_ID }),
    },
  ],
}
`.trim(),
    }
    const out = generateImplFile(wcard, { githubLogin: 'gh', iso: '2026-05-09T00:00:00Z' })
    expect(out).toMatch(/handler:\s*\(_context\)\s*=>/)
  })
})
