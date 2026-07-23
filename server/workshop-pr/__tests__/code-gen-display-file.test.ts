import { describe, it, expect } from 'vitest'
import { generateDisplayFile } from '../code-gen'

describe('generateDisplayFile', () => {
  it('emits a minor Card Source file', () => {
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
    expect(out).toContain(`import { defineMinorCard } from '../card-source'`)
    expect(out).not.toContain(`import { defineOccupationCard }`)
    expect(out).toContain(`export const CUSTOM_Foo = defineMinorCard({`)
    expect(out).toContain(`const CARD_IMPL`)
    expect(out).toContain(`import type { CardImpl } from '../registry'`)
    expect(out).not.toContain(`gainLeaf`)
    expect(out).toContain(`@alicegh`)
  })

  it('uses defineOccupationCard for occupation cards', () => {
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
    expect(out).toContain(`import { defineOccupationCard } from '../card-source'`)
    expect(out).not.toContain(`import { defineMinorCard }`)
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
    expect(out).toContain(`impl: cardImpl`)
  })

  it('injects locales into object-literal Card Source metadata', () => {
    const wcard = {
      id: 'wc-loc-object',
      card_id: 'CUSTOM_ObjectLocalisedCard',
      card_type: 'minor',
      card_json: JSON.stringify({
        locales: { zh: { name: '新名称', desc: ['新描述。'] } },
      }),
      effect_code: `
const CARD_ID = 'CUSTOM_ObjectLocalisedCard'
const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Object Localised Card',
    deck: 'CUSTOM',
    number: 0,
    desc: ['English desc.'],
    cost: {},
    vp: 0,
    locales: { zh: { name: '旧名称', desc: ['旧描述。'] } },
  },
}
const CARD_IMPL = {}
`.trim(),
    }
    const out = generateDisplayFile(wcard, {
      githubLogin: 'gh',
      iso: '2026-05-09T00:00:00Z',
    })
    expect(out).toContain('新名称')
    expect(out).toContain('新描述。')
    expect(out).not.toContain('旧名称')
    expect(out).not.toContain('旧描述。')
    expect(out).toContain(`deck: "community"`)
  })

  it('generates handoff source from factory-style card definitions', () => {
    const out = generateDisplayFile({
      id: 'wc-factory',
      card_id: 'CUSTOM_FactoryCard',
      card_type: 'minor',
      card_json: JSON.stringify({
        locales: { zh: { name: '工厂卡', desc: ['工厂说明。'] } },
      }),
      effect_code: `
const CARD_ID = 'CUSTOM_FactoryCard'
const CARD_DEF = MinorImprovement({
  id: CARD_ID,
  name: 'Factory Card',
  deck: 'CUSTOM',
  number: 0,
  desc: ['Factory description.'],
  cost: { wood: 1 },
  vp: 1,
})
const CARD_IMPL = {}
      `.trim(),
    }, {
      githubLogin: 'gh',
      iso: '2026-05-09T00:00:00Z',
    })

    expect(out).toContain(`export const CUSTOM_FactoryCard = defineMinorCard({`)
    expect(out).toContain(`cost: { wood: 1 }`)
    expect(out).toContain('工厂卡')
    expect(out).toContain('工厂说明。')
  })
})
