import { describe, it, expect } from 'vitest'
import { generateImplFile } from '../code-gen'

describe('generateImplFile', () => {
  it('emits Card Source with CardImpl type + only used helpers', () => {
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
    expect(out).toContain(`import { defineMinorCard } from '../card-source'`)
    expect(out).toContain(`import type { CardImpl } from '../registry'`)
    expect(out).toContain(`import { gainLeaf } from '../helpers/pay-gain-node'`)
    expect(out).not.toContain(`import { payLeaf }`)
    expect(out).toContain(`const CARD_IMPL`)
    expect(out).toContain(`export const CUSTOM_Foo = defineMinorCard({`)
    expect(out).toContain(`export const CUSTOM_Foo_impl = CUSTOM_Foo.impl`)
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
    expect(out).toContain(`const CARD_ID = 'CUSTOM_Hut'`)
    expect(out).toContain(`export const CUSTOM_Hut_impl = CUSTOM_Hut.impl`)
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
      actions: ['improvement'],
      phases: ['computeCosts'],
      handler: (context) => ({ costs: { stone: -1 }, sourceCard: CARD_ID }),
    },
  ],
}
`.trim(),
    }
    const out = generateImplFile(wcard, { githubLogin: 'gh', iso: '2026-05-09T00:00:00Z' })
    expect(out).toMatch(/handler:\s*\(_context: any\)\s*=>/)
  })

  it('keeps top-level helpers CARD_IMPL reaches and types them for the strict build', () => {
    const wcard = {
      id: 'wc-helpers',
      card_id: 'CUSTOM_Gleanerish',
      card_type: 'occupation',
      effect_code: `
const CARD_ID = 'CUSTOM_Gleanerish'
const SPACES = ['forest', 'clay-pit']
function isTracked(context) {
  return SPACES.includes(context.space.id)
}
function buildFlow(gained) {
  const children = Object.entries(gained).map(([resource]) => gainLeaf(CARD_ID, { [resource]: 1 }))
  return { type: 'seq', children }
}
function unusedHelper() {
  return payLeaf(CARD_ID, { food: 1 })
}
console.log('sandbox only')
const CARD_DEF = new Occupation({ id: CARD_ID, name: 'G', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        if (!isTracked(context)) return
        return { flow: buildFlow(context.result?.resourcesGained), sourceCard: CARD_ID }
      },
    },
  ],
}
`.trim(),
    }
    const out = generateImplFile(wcard, { githubLogin: 'gh', iso: '2026-05-09T00:00:00Z' })
    expect(out).toContain(`const SPACES = ['forest', 'clay-pit']`)
    expect(out).toContain('function isTracked(context: any): any {')
    expect(out).toContain('function buildFlow(gained: any): any {')
    expect(out).toMatch(/\.map\(\(\[resource\]: any\) =>/)
    expect(out).toMatch(/handler:\s*\(context: any\)\s*=>/)
    expect(out.indexOf('const SPACES')).toBeLessThan(out.indexOf('const CARD_IMPL'))
    expect(out).toContain('/* eslint-disable @typescript-eslint/no-explicit-any')
    expect(out).toContain(`import { gainLeaf } from '../helpers/pay-gain-node'`)
    expect(out).not.toContain('unusedHelper')
    expect(out).not.toContain(`import { payLeaf }`)
    expect(out).not.toContain('sandbox only')
    expect(out).not.toContain('new Occupation(')
  })

  it('emits no lint directive when nothing is typed as any', () => {
    const wcard = {
      id: 'wc-plain',
      card_id: 'CUSTOM_Plain',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_Plain'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Plain', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID, onHarvest: () => gainLeaf(CARD_ID, { food: 1 }) } }
`.trim(),
    }
    const out = generateImplFile(wcard, { githubLogin: 'gh', iso: '2026-05-09T00:00:00Z' })
    expect(out).not.toContain('eslint-disable')
  })
})
