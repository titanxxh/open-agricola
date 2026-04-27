import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { patchCommunityCardsMarkdown } from '../code-gen'

describe('patchCommunityCardsMarkdown', () => {
  it('appends a row inside the entries markers', () => {
    const existing = `# Community Cards\n<!-- community-card-entries:begin -->\n| Card ID | Name | Type | Author | PR |\n|---|---|---|---|---|\n<!-- community-card-entries:end -->\n`
    const patched = patchCommunityCardsMarkdown(existing, {
      card_id: 'CUSTOM_New',
      card_name: 'New One',
      card_type: 'minor',
      github_login: 'bob',
      pr_number: 42,
    })
    expect(patched).toContain(`| CUSTOM_New | New One | minor | @bob | #42 |`)
    expect(patched).toMatch(
      /CUSTOM_New \| New One.*\n<!-- community-card-entries:end -->/,
    )
  })

  it('is idempotent', () => {
    const existing = `<!-- community-card-entries:begin -->\n| CUSTOM_X | X | minor | @a | #1 |\n<!-- community-card-entries:end -->\n`
    const patched = patchCommunityCardsMarkdown(existing, {
      card_id: 'CUSTOM_X',
      card_name: 'X',
      card_type: 'minor',
      github_login: 'a',
      pr_number: 1,
    })
    expect(patched).toBe(existing)
  })

  it('throws when markers missing', () => {
    expect(() =>
      patchCommunityCardsMarkdown('no markers', {
        card_id: 'CUSTOM_X',
        card_name: 'X',
        card_type: 'minor',
        github_login: 'a',
        pr_number: 1,
      }),
    ).toThrow()
  })

  it('patches the checked-in community cards document', () => {
    const source = readFileSync(join(process.cwd(), 'docs/community_cards.md'), 'utf8')
    const patched = patchCommunityCardsMarkdown(source, {
      card_id: 'CUSTOM_RegressionMarker',
      card_name: 'Regression Marker',
      card_type: 'minor',
      github_login: 'tester',
      pr_number: 999,
    })
    expect(patched).toContain('| CUSTOM_RegressionMarker | Regression Marker | minor | @tester | #999 |')
  })
})
