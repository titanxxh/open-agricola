import { describe, it, expect } from 'vitest'
import { generateMainCardFile, generatePrFiles } from '../code-gen'

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

  it('injects locales from card_json into the generated CARD_DEF', () => {
    const wcard = {
      id: 'wc-loc',
      card_id: 'CUSTOM_LocalisedCard',
      card_type: 'minor',
      author_name: 'alice',
      card_json: JSON.stringify({
        locales: {
          zh: { name: '本地化卡', desc: ['中文描述。'] },
        },
      }),
      effect_code: `
const CARD_ID = 'CUSTOM_LocalisedCard'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Localised Card', deck: 'CUSTOM', number: 0, desc: ['English desc.'], cost: {}, vp: 0 })
const CARD_IMPL = {}
`.trim(),
    }

    const out = generateMainCardFile(wcard, {
      githubLogin: 'alicegh',
      iso: '2026-04-22T00:00:00Z',
    })

    expect(out).toContain('本地化卡')
    expect(out).toContain('中文描述。')
    expect(out).toContain('locales:')
    expect(out).toMatch(/zh:\s*\{/)
  })

  it('replaces a stale locales block in the source with card_json.locales', () => {
    const wcard = {
      id: 'wc-loc2',
      card_id: 'CUSTOM_StaleLocale',
      card_type: 'minor',
      author_name: 'alice',
      card_json: JSON.stringify({
        locales: {
          zh: { name: '新中文名', desc: ['新中文描述。'] },
        },
      }),
      effect_code: `
const CARD_ID = 'CUSTOM_StaleLocale'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Card', deck: 'CUSTOM', number: 0, desc: ['English desc.'], cost: {}, vp: 0, locales: { zh: { name: '旧中文名', desc: ['旧描述。'] } } })
const CARD_IMPL = {}
`.trim(),
    }

    const out = generateMainCardFile(wcard, {
      githubLogin: 'alicegh',
      iso: '2026-04-22T00:00:00Z',
    })

    expect(out).toContain('新中文名')
    expect(out).not.toContain('旧中文名')
    expect(out).not.toContain('旧描述。')
  })

  it('omits locales field when card_json has none', () => {
    const wcard = {
      id: 'wc-loc3',
      card_id: 'CUSTOM_NoLocale',
      card_type: 'minor',
      author_name: 'alice',
      card_json: JSON.stringify({}),
      effect_code: `
const CARD_ID = 'CUSTOM_NoLocale'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Card', deck: 'CUSTOM', number: 0, desc: ['English desc.'], cost: {}, vp: 0 })
const CARD_IMPL = {}
`.trim(),
    }

    const out = generateMainCardFile(wcard, {
      githubLogin: 'alicegh',
      iso: '2026-04-22T00:00:00Z',
    })

    expect(out).not.toContain('locales:')
  })

  it('normalizes workshop code for community deck and listener ids', () => {
    const wcard = {
      id: 'wc3',
      card_id: 'CUSTOM_MedievalMallet',
      card_type: 'minor',
      author_name: 'xxh',
      effect_code: `
const CARD_ID = 'CUSTOM_MedievalMallet'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Mallet', deck: 'CUSTOM', number: 0, desc: [], cost: {}, vp: 0, prerequisite: { occupation: 2 } })
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
    expect(out).toContain(`occupationPrerequisites: { min: 2 }`)
    expect(out).toContain(`prerequisite: "2 Occupations"`)
    expect(out).toContain(`const CARD_IMPL: CardImpl =`)
    expect(out).toContain(`id: "CUSTOM_MedievalMallet-listener-1"`)
    expect(out).toContain(`id: 'custom-existing'`)
    expect(out).not.toContain(`deck: 'CUSTOM'`)
  })

  it('underscores unused listener handler params (TS6133 prevention)', () => {
    const wcard = {
      id: 'wc-unused',
      card_id: 'CUSTOM_FlatDiscount',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_FlatDiscount'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Discount', deck: 'CUSTOM', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['improvement-any'],
      phases: ['computeCosts'],
      handler: (context) => {
        return { costs: { stone: -1 }, sourceCard: CARD_ID }
      },
    },
  ],
}
`.trim(),
    }
    const out = generateMainCardFile(wcard, { githubLogin: 'gh', iso: '2026-04-28T00:00:00Z' })
    expect(out).toMatch(/handler:\s*\(_context\)\s*=>/)
    expect(out).not.toMatch(/handler:\s*\(context\)\s*=>/)
  })

  it('keeps used params untouched even when other params are unused', () => {
    const wcard = {
      id: 'wc-mixed',
      card_id: 'CUSTOM_Mixed',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_Mixed'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Mixed', deck: 'CUSTOM', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => {
      if (player.houseType === 'stone') return
      return undefined
    },
  },
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['after'],
      handler: (context) => {
        return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
      },
    },
  ],
}
`.trim(),
    }
    const out = generateMainCardFile(wcard, { githubLogin: 'gh', iso: '2026-04-28T00:00:00Z' })
    // onRoundStart: state unused, player used
    expect(out).toMatch(/onRoundStart:\s*\(_state,\s*player\)/)
    // listener handler: context unused
    expect(out).toMatch(/handler:\s*\(_context\)\s*=>/)
  })

  it('does not double-underscore params that are already prefixed', () => {
    const wcard = {
      id: 'wc-already',
      card_id: 'CUSTOM_AlreadyPrefixed',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_AlreadyPrefixed'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Pre', deck: 'CUSTOM', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['improvement-any'],
      phases: ['computeCosts'],
      handler: (_ctx) => ({ costs: { stone: -1 }, sourceCard: CARD_ID }),
    },
  ],
}
`.trim(),
    }
    const out = generateMainCardFile(wcard, { githubLogin: 'gh', iso: '2026-04-28T00:00:00Z' })
    expect(out).toContain('(_ctx)')
    expect(out).not.toContain('(__ctx)')
  })

  it('treats nested closure references as a use of the outer param', () => {
    const wcard = {
      id: 'wc-closure',
      card_id: 'CUSTOM_Closure',
      card_type: 'minor',
      effect_code: `
const CARD_ID = 'CUSTOM_Closure'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Closure', deck: 'CUSTOM', number: 0, desc: [], cost: {}, vp: 0 })
const CARD_IMPL = {
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['after'],
      handler: (context) => {
        const ids = (context.state?.players ?? []).map((p) => p.id)
        return { flow: undefined, sourceCard: CARD_ID, _ids: ids }
      },
    },
  ],
}
`.trim(),
    }
    const out = generateMainCardFile(wcard, { githubLogin: 'gh', iso: '2026-04-28T00:00:00Z' })
    // context is referenced inside the nested arrow body => keep as-is
    expect(out).toMatch(/handler:\s*\(context\)\s*=>/)
    expect(out).not.toMatch(/handler:\s*\(_context\)/)
  })
})

describe('generatePrFiles — output file list (S9 dual-file split)', () => {
  const upstreamRegisterAll = `// generated\nimport { CUSTOM_FixtureHarvester_impl } from './community/CUSTOM_FixtureHarvester'\n\nexport const ALL_CARD_IMPLS = {\n  'CUSTOM_FixtureHarvester': CUSTOM_FixtureHarvester_impl,\n}\n\nexport type AllCardImpls = typeof ALL_CARD_IMPLS\n`
  const upstreamAutoCatalog = `// GENERATED\nimport type { MinorImprovement, Occupation } from '../../cards-display/types'\n\nimport { CUSTOM_FixtureHarvester } from '../../cards-display/community/CUSTOM_FixtureHarvester'\n\nexport const allCommunityCards: Array<MinorImprovement | Occupation> = [\n  CUSTOM_FixtureHarvester,\n]\n`
  const upstreamCommunityMd = `# Community Cards\n\n<!-- community-card-entries:begin -->\n<!-- community-card-entries:end -->\n`

  it('emits 6 files (display + impl + smoke test + register-all + auto-catalog + community.md)', async () => {
    const wcard = {
      id: 'wc1',
      card_id: 'CUSTOM_NewCard',
      card_type: 'minor',
      author_name: 'alice',
      effect_code: `const CARD_ID = 'CUSTOM_NewCard'\nconst CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Card', deck: 'community', number: 0, desc: [], cost: {}, vp: 1 })\nconst CARD_IMPL = {}`,
      card_json: JSON.stringify({ name: 'Card' }),
    }
    const files = await generatePrFiles({
      wcard,
      github_login: 'alicegh',
      upstream_register_all: upstreamRegisterAll,
      upstream_auto_catalog: upstreamAutoCatalog,
      upstream_community_md: upstreamCommunityMd,
      pr_number: 1,
    })
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([
      'docs/community_cards.md',
      'shared/cards-display/community/CUSTOM_NewCard.ts',
      'shared/cards/community/CUSTOM_NewCard.ts',
      'shared/cards/community/__tests__/CUSTOM_NewCard.test.ts',
      'shared/cards/community/auto-catalog.ts',
      'shared/cards/register-all.ts',
    ])
  })

  it('display file contains CARD_DEF only; impl file contains CARD_IMPL only', async () => {
    const wcard = {
      id: 'wc1',
      card_id: 'CUSTOM_X',
      card_type: 'minor',
      effect_code: `const CARD_ID = 'CUSTOM_X'\nconst CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'X', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 })\nconst CARD_IMPL = { effect: { id: CARD_ID } }`,
    }
    const files = await generatePrFiles({
      wcard,
      github_login: 'gh',
      upstream_register_all: upstreamRegisterAll,
      upstream_auto_catalog: upstreamAutoCatalog,
      upstream_community_md: upstreamCommunityMd,
      pr_number: 2,
    })
    const display = files.find((f) => f.path === 'shared/cards-display/community/CUSTOM_X.ts')!
    const impl = files.find((f) => f.path === 'shared/cards/community/CUSTOM_X.ts')!
    expect(display.content).toContain('CARD_DEF = new MinorImprovement(')
    expect(display.content).not.toContain('CARD_IMPL')
    expect(impl.content).toMatch(/const CARD_IMPL\b/)
    expect(impl.content).not.toContain('new MinorImprovement(')
    expect(impl.content).toContain(`from '../../cards-display/community/CUSTOM_X'`)
  })
})
