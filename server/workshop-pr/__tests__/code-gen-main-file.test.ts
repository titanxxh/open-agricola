import { describe, it, expect } from 'vitest'
import { generateMainCardFile } from '../code-gen'

describe('generateMainCardFile', () => {
  it('generates MinorImprovement card with only used helper imports', () => {
    const wcard = {
      id: 'wc1',
      card_id: 'CUSTOM_Foo',
      card_type: 'minor',
      author_name: 'alice',
      description: 'test desc',
      effect_code: `
const CARD_ID = 'CUSTOM_Foo'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Foo', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID, onHarvest: () => gainLeaf(CARD_ID, { food: 2 }) } }
`.trim(),
    }
    const out = generateMainCardFile(wcard, {
      githubLogin: 'alicegh',
      iso: '2026-04-22T00:00:00Z',
    })
    expect(out).toContain(`import { MinorImprovement } from '../types'`)
    expect(out).not.toContain(`import { Occupation }`)
    expect(out).toContain(`import { gainLeaf } from '../helpers/pay-gain-node'`)
    expect(out).not.toContain(`import { payLeaf }`)
    expect(out).toContain(`const CARD_ID = 'CUSTOM_Foo'`)
    expect(out).toContain(`deck: 'community'`)
    expect(out).toContain(`gainLeaf(CARD_ID, { food: 2 })`)
    expect(out).toContain(`export const CUSTOM_Foo = CARD_DEF`)
    expect(out).toContain(
      `export const CUSTOM_Foo_impl = CARD_IMPL satisfies CardImpl`,
    )
    expect(out).toContain('@alicegh')
    expect(out).toContain('2026-04-22T00:00:00Z')
  })

  it('imports Occupation for card_type=occupation', () => {
    const wcard = {
      id: 'wc2',
      card_id: 'CUSTOM_Bar',
      card_type: 'occupation',
      author_name: 'bob',
      effect_code: `const CARD_DEF = new Occupation({ id: 'CUSTOM_Bar', deck: 'community', number: 0, name: 'Bar', desc: [], cost: {} }); const CARD_IMPL = {}`,
    }
    const out = generateMainCardFile(wcard as any, {
      githubLogin: 'bobgh',
      iso: '2026-04-22T00:00:00Z',
    })
    expect(out).toContain(`import { Occupation } from '../types'`)
    expect(out).not.toContain(`import { MinorImprovement }`)
  })

  it('normalizes workshop code for community deck and listener ids', () => {
    const wcard = {
      id: 'wc3',
      card_id: 'CUSTOM_MedievalMallet',
      card_type: 'minor',
      author_name: 'xxh',
      effect_code: `
const CARD_ID = 'CUSTOM_MedievalMallet'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Mallet', deck: 'CUSTOM', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  listeners: [
    { cardIds: [CARD_ID], actions: ['renovate-house'], phases: ['computeCosts'], handler: () => undefined },
    { id: 'custom-existing', cardIds: [CARD_ID], actions: ['improvement-any'], phases: ['computeCosts'], handler: () => undefined },
  ],
}
`.trim(),
    }

    const out = generateMainCardFile(wcard, {
      githubLogin: 'titanxxh',
      iso: '2026-04-22T00:00:00Z',
    })

    expect(out).toContain(`deck: "community"`)
    expect(out).toContain(`id: "CUSTOM_MedievalMallet-listener-1"`)
    expect(out).toContain(`id: 'custom-existing'`)
    expect(out).not.toContain(`deck: 'CUSTOM'`)
  })
})
