import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '../github-client'

afterEach(() => vi.unstubAllGlobals())

describe('Workshop branch publication', () => {
  it('preserves an empty GraphQL HTTP failure without treating it as a reviewer conflict', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('/graphql')
      ? new Response('',{status:502,headers:{'X-GitHub-Request-Id':'ABCD:5678'}})
      : Response.json({node_id:'repo'}))
    const client = new GitHubClient({token:'secret',upstreamOwner:'titanxxh',upstreamRepo:'open-agricola'})
    await expect(client.publishBranch({branchName:'workshop/card/proposal',expectedHead:null,commitSha:'new'}))
      .rejects.toMatchObject({code:'branch_publish_failed',status:502,diagnostic:{kind:'http',operation:'branch_publish',httpStatus:502,requestId:'ABCD:5678'}})
  })

  it.each([
    {error:new DOMException('secret','TimeoutError'),code:'github_timeout',kind:'timeout'},
    {error:new TypeError('secret',{cause:{code:'ECONNRESET'}}),code:'github_network_error',kind:'network'},
  ])('classifies transport failure as $code without retaining its message', async ({error,code,kind}) => {
    vi.stubGlobal('fetch',async () => {throw error})
    const client = new GitHubClient({token:'secret',upstreamOwner:'titanxxh',upstreamRepo:'open-agricola'})
    const caught = await client.getPullRequest(1).catch((error: unknown) => error)
    expect(caught).toMatchObject({code,status:503,diagnostic:{kind,operation:'pr_read'}})
    expect(JSON.stringify(caught)).not.toContain('secret')
  })

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
