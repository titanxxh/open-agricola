import { describe, it, expect } from 'vitest'
import { generatePrFiles } from '../code-gen'

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
