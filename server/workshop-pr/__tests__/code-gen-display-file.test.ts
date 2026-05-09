import { describe, it, expect } from 'vitest'
import { generateDisplayFile } from '../code-gen'

describe('generateDisplayFile', () => {
  it('emits cards-display path with MinorImprovement import + CARD_DEF only', () => {
    const wcard = {
      id: 'wc1',
      card_id: 'CUSTOM_Foo',
      card_type: 'minor',
      author_name: 'alice',
      effect_code: `
const CARD_ID = 'CUSTOM_Foo'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Foo', deck: 'community', number: 0, desc: [], cost: {}, vp: 1 })
const CARD_IMPL = { effect: { id: CARD_ID } }
`.trim(),
    }
    const out = generateDisplayFile(wcard, {
      githubLogin: 'alicegh',
      iso: '2026-05-09T00:00:00Z',
    })
    expect(out).toContain(`import { MinorImprovement } from '../types'`)
    expect(out).not.toContain(`import { Occupation }`)
    expect(out).toContain(`const CARD_DEF = new MinorImprovement(`)
    expect(out).toContain(`export const CUSTOM_Foo = CARD_DEF`)
    expect(out).not.toContain(`CARD_IMPL`)
    expect(out).not.toContain(`CardImpl`)
    expect(out).not.toContain(`gainLeaf`)
    expect(out).toContain(`@alicegh`)
  })

  it('uses Occupation import for occupation cards', () => {
    const wcard = {
      id: 'wc2',
      card_id: 'CUSTOM_Bar',
      card_type: 'occupation',
      effect_code: `
const CARD_ID = 'CUSTOM_Bar'
const CARD_DEF = new Occupation({ id: CARD_ID, deck: 'community', number: 0, name: 'Bar', desc: [], cost: {} })
const CARD_IMPL = {}
`.trim(),
    }
    const out = generateDisplayFile(wcard as any, {
      githubLogin: 'gh',
      iso: '2026-05-09T00:00:00Z',
    })
    expect(out).toContain(`import { Occupation } from '../types'`)
    expect(out).not.toContain(`import { MinorImprovement }`)
  })

  it('injects locales from card_json into CARD_DEF', () => {
    const wcard = {
      id: 'wc-loc',
      card_id: 'CUSTOM_LocalisedCard',
      card_type: 'minor',
      card_json: JSON.stringify({
        locales: { zh: { name: '本地化卡', desc: ['中文描述。'] } },
      }),
      effect_code: `
const CARD_ID = 'CUSTOM_LocalisedCard'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Localised Card', deck: 'CUSTOM', number: 0, desc: ['English desc.'], cost: {}, vp: 0 })
const CARD_IMPL = {}
`.trim(),
    }
    const out = generateDisplayFile(wcard, {
      githubLogin: 'gh',
      iso: '2026-05-09T00:00:00Z',
    })
    expect(out).toContain('本地化卡')
    expect(out).toContain('中文描述。')
    expect(out).toContain(`deck: "community"`)
  })
})
