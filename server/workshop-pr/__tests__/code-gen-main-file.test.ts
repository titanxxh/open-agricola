import { describe, it, expect } from 'vitest'
import { generatePrFiles } from '../code-gen'

describe('generatePrFiles — output file list', () => {
  const upstreamRegisterAll = `// generated\nimport { CUSTOM_FixtureHarvester } from './community/CUSTOM_FixtureHarvester'\n\nexport const ALL_CARD_IMPLS = {\n  'CUSTOM_FixtureHarvester': CUSTOM_FixtureHarvester.impl,\n}\n\nexport type AllCardImpls = typeof ALL_CARD_IMPLS\n`
  const upstreamCatalogGenerated = `// generated
export const catalogCardDefinitions = [
  {
    "id": "CUSTOM_FixtureHarvester",
    "name": "Fixture Harvester",
    "deck": "community",
    "number": 0,
    "desc": [],
    "kind": "minor"
  },
]
`
  const upstreamCommunityMd = `# Community Cards\n\n<!-- community-card-entries:begin -->\n<!-- community-card-entries:end -->\n`

  it('emits 4 files without a generated test', async () => {
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
      upstream_catalog_generated: upstreamCatalogGenerated,
      upstream_community_md: upstreamCommunityMd,
      pr_number: 1,
    })
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([
      'docs/community_cards.md',
      'shared/cards/catalog.generated.ts',
      'shared/cards/community/CUSTOM_NewCard.ts',
      'shared/cards/register-all.ts',
    ])
  })

  it('card source file contains meta and impl together', async () => {
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
      upstream_catalog_generated: upstreamCatalogGenerated,
      upstream_community_md: upstreamCommunityMd,
      pr_number: 2,
    })
    const source = files.find((f) => f.path === 'shared/cards/community/CUSTOM_X.ts')!
    expect(source.content).toContain(`import { defineMinorCard } from '../card-source'`)
    expect(source.content).toMatch(/const CARD_IMPL\b/)
    expect(source.content).toContain(`export const CUSTOM_X = defineMinorCard({`)
    expect(source.content).toContain(`impl: cardImpl`)
    expect(source.content).not.toContain('new MinorImprovement(')
  })
})
