import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '../github-client'

afterEach(() => vi.unstubAllGlobals())

describe('Workshop branch publication', () => {
  it('does not overwrite a reviewer push made after the submission was prepared', async () => {
    let head = 'reviewer-head'
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/repos/titanxxh/open-agricola')) {
        return Response.json({ node_id: 'repository-id' })
      }
      if (url.endsWith('/graphql')) {
        const { variables } = JSON.parse(String(init?.body))
        const update = variables.input.refUpdates[0]
        if (update.beforeOid !== head) return Response.json({ errors: [{ message: 'Reference has changed' }] })
        head = update.afterOid
        return Response.json({ data: { updateRefs: { clientMutationId: null } } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new GitHubClient({ token: 'app-token', upstreamOwner: 'titanxxh', upstreamRepo: 'open-agricola' })
    await expect(client.publishBranch({
      branchName: 'workshop/card-id/submission-id',
      expectedHead: 'previous-generated-head',
      commitSha: 'new-generated-head',
    })).rejects.toMatchObject({ code: 'branch_conflict' })
    expect(head).toBe('reviewer-head')
  })
})
