import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { GitHubReviewProvider } from '../workshop-review/github-review-provider.ts'

const json = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
)
const pullRequestJson = (pullRequest: Record<string, unknown>): Response =>
  json({ data: { repository: { pullRequest } } })

describe('GitHubReviewProvider', () => {
  it('reads one atomic pull-request review snapshot with an installation token', async () => {
    const privateKey = generateKeyPairSync('rsa', { modulusLength: 1024 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({
        token: 'installation-token',
        expires_at: '2026-07-31T17:00:00Z',
      }))
      .mockResolvedValueOnce(pullRequestJson({
        authorAssociation: 'CONTRIBUTOR',
        reviewDecision: 'APPROVED',
        headRefOid: 'head-42',
        baseRefName: 'main',
        state: 'OPEN',
        isDraft: false,
        latestOpinionatedReviews: {
          nodes: [{
            id: 'review-42',
            state: 'APPROVED',
            commit: { oid: 'head-42' },
            authorCanPushToRepository: true,
          }],
        },
      }))
    const provider = new GitHubReviewProvider({
      appId: '123',
      privateKey,
      installationId: '456',
      repositoryOwner: 'titanxxh',
      repositoryName: 'open-agricola',
      fetchImpl,
      now: () => Date.parse('2026-07-31T16:00:00Z'),
    })

    await expect(provider.getPullRequestSnapshot(42)).resolves.toEqual({
      reviewDecision: 'APPROVED',
      headRefOid: 'head-42',
      baseRefName: 'main',
      state: 'OPEN',
      isDraft: false,
      reviews: [{
        id: 'review-42',
        state: 'APPROVED',
        commitOid: 'head-42',
        authorCanPushToRepository: true,
      }],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://api.github.com/app/installations/456/access_tokens',
    )
    const graphQlBody = JSON.parse(String(fetchImpl.mock.calls[1]![1]?.body))
    expect(graphQlBody.query).toContain('baseRefName')
    expect(graphQlBody.query).toContain('isDraft')
    expect(graphQlBody.query).toContain('state')
    expect(graphQlBody.query).toContain('authorAssociation')
    expect(graphQlBody.variables).toEqual({
      owner: 'titanxxh',
      name: 'open-agricola',
      number: 42,
    })

    fetchImpl.mockResolvedValueOnce(pullRequestJson({
      authorAssociation: 'OWNER',
      reviewDecision: null,
      headRefOid: 'head-43',
      baseRefName: 'main',
      state: 'OPEN',
      isDraft: false,
      latestOpinionatedReviews: { nodes: [] },
    }))

    await expect(provider.getPullRequestSnapshot(43)).resolves.toEqual({
      reviewDecision: 'APPROVED',
      headRefOid: 'head-43',
      baseRefName: 'main',
      state: 'OPEN',
      isDraft: false,
      reviews: [{
        id: 'owner:head-43',
        state: 'APPROVED',
        commitOid: 'head-43',
        authorCanPushToRepository: true,
      }],
    })

    fetchImpl.mockResolvedValueOnce(pullRequestJson({
      authorAssociation: 'OWNER',
      reviewDecision: 'CHANGES_REQUESTED',
      headRefOid: 'head-44',
      baseRefName: 'main',
      state: 'OPEN',
      isDraft: false,
      latestOpinionatedReviews: { nodes: [] },
    }))

    await expect(provider.getPullRequestSnapshot(44)).resolves.toMatchObject({
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: [],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })
})
