import { expect, it } from 'vitest'
import { platformIssueUrl } from '../platform-issue'

const draft = { cardId: 'CUSTOM_HarvestWatcher', cardType: 'occupation' as const, name: 'Harvest Watcher', description: 'Each time another player harvests, gain 1 food.' }
const feasibility = {
  verdict: 'needs-platform' as const, summary: 'No hook observes another player\'s harvest.',
  evidence: [{ path: 'docs/architecture/hooks.md', finding: 'Harvest hooks run for the owner only.' }],
  gaps: ['A harvest hook that fires for every player.'], questions: [],
}

it('prefills a triaged issue with the card request, the gaps and the evidence', () => {
  const url = new URL(platformIssueUrl({ draft, feasibility, request: 'gain food when others harvest', referenceCommit: 'abc123' }))
  expect(url.origin + url.pathname).toBe('https://github.com/titanxxh/open-agricola/issues/new')
  expect(url.searchParams.get('title')).toBe('Workshop card CUSTOM_HarvestWatcher needs a platform change')
  expect(url.searchParams.get('labels')).toBe('needs-triage')
  const body = url.searchParams.get('body')!
  for (const text of ['`CUSTOM_HarvestWatcher`', 'Type: occupation', 'Card text: Each time another player harvests', 'Author request: gain food when others harvest',
    'No hook observes', 'commit `abc123`', '- A harvest hook that fires for every player.', '`docs/architecture/hooks.md`: Harvest hooks run for the owner only.']) {
    expect(body).toContain(text)
  }
})

it('omits empty optional lines and bounds a long body', () => {
  const body = new URL(platformIssueUrl({ draft: { ...draft, description: ' ' }, request: '', feasibility: { ...feasibility, summary: 'x'.repeat(9000) } })).searchParams.get('body')!
  expect(body).not.toContain('Card text')
  expect(body).not.toContain('Author request')
  expect(body).not.toContain('Researched at commit')
  expect(body.length).toBeLessThanOrEqual(6003)
  expect(body.endsWith('…')).toBe(true)
})
