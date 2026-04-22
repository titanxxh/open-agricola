import { describe, it, expect } from 'vitest'
import { generatePrFiles } from '../code-gen'

describe('generatePrFiles', () => {
  const wcard = {
    id: 'wc1',
    card_id: 'CUSTOM_Foo',
    card_type: 'minor',
    card_json: JSON.stringify({ name: 'Foo Card', vp: 1 }),
    effect_code: `const CARD_DEF = new MinorImprovement({ id: 'CUSTOM_Foo', deck: 'community', number: 0, name: 'Foo Card', desc: [], cost: {}, vp: 1 }); const CARD_IMPL = {}`,
    art_url: null as string | null,
    author_name: 'alice',
    description: '',
  }

  const upstreamRegisterAll = `// GENERATED ...
import './catalog'

import { A1_impl } from './A/A1_X'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'A1': A1_impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`
  const upstreamMd = `# CC\n<!-- community-card-entries:begin -->\n| ID |\n<!-- community-card-entries:end -->\n`

  it('returns 4 files when no art', async () => {
    const files = await generatePrFiles({
      wcard,
      github_login: 'alice-gh',
      upstream_register_all: upstreamRegisterAll,
      upstream_community_md: upstreamMd,
      pr_number: 0,
      art_data: null,
    })
    expect(files).toHaveLength(4)
    expect(files.map((f) => f.path)).toEqual([
      'shared/cards/community/CUSTOM_Foo.ts',
      'shared/cards/community/__tests__/CUSTOM_Foo.test.ts',
      'shared/cards/register-all.ts',
      'docs/community_cards.md',
    ])
  })

  it('returns 5 files when art_data provided', async () => {
    const files = await generatePrFiles({
      wcard,
      github_login: 'alice-gh',
      upstream_register_all: upstreamRegisterAll,
      upstream_community_md: upstreamMd,
      pr_number: 0,
      art_data: { ext: 'webp', buffer: Buffer.from('fakepng') },
    })
    expect(files).toHaveLength(5)
    expect(files[4]!.path).toBe('public/card-art/community/CUSTOM_Foo.webp')
    expect(files[4]!.encoding).toBe('base64')
  })

  it('uses card name from card_json in community_cards.md patch', async () => {
    const files = await generatePrFiles({
      wcard,
      github_login: 'alice-gh',
      upstream_register_all: upstreamRegisterAll,
      upstream_community_md: upstreamMd,
      pr_number: 7,
      art_data: null,
    })
    const mdFile = files.find((f) => f.path === 'docs/community_cards.md')!
    expect(mdFile.content).toContain(
      '| CUSTOM_Foo | Foo Card | minor | @alice-gh | #7 |',
    )
  })
})
