import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { WorkshopGitHubApp } from '../github-app'

describe('Workshop App credentials', () => {
  it.each([401, 403, 500, 502])('preserves HTTP %s when the token response is empty', async status => {
    const app = new WorkshopGitHubApp({
      appId:'123',installationId:'456',repositoryOwner:'titanxxh',repositoryName:'open-agricola',
      privateKey:generateKeyPairSync('rsa',{modulusLength:1024}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),
      fetchImpl:async () => new Response('', {status, headers:{'X-GitHub-Request-Id':'ABCD:1234'}}),
    })
    await expect(app.token('write')).rejects.toMatchObject({
      code:'workshop_app_unavailable', status,
      diagnostic:{kind:'http',operation:'installation_token',httpStatus:status,requestId:'ABCD:1234'},
    })
  })

  it.each([429,403])('honors GitHub waiting instructions on token issuance HTTP %s', async status => {
    const app = new WorkshopGitHubApp({
      appId:'123',installationId:'456',repositoryOwner:'titanxxh',repositoryName:'open-agricola',
      privateKey:generateKeyPairSync('rsa',{modulusLength:1024}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),
      fetchImpl:async () => Response.json({message:'rate limited'},{status,headers:{'Retry-After':'3600'}}),
    })
    await expect(app.token('write')).rejects.toMatchObject({code:'github_rate_limited',status:429,retryAfter:3600})
  })

  it.each(['', '<html>private response</html>', 'null'])('classifies malformed successful token responses', async body => {
    const app = new WorkshopGitHubApp({
      appId:'123',installationId:'456',repositoryOwner:'titanxxh',repositoryName:'open-agricola',
      privateKey:generateKeyPairSync('rsa',{modulusLength:1024}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),
      fetchImpl:async () => new Response(body,{status:201}),
    })
    await expect(app.token('write')).rejects.toMatchObject({code:'github_invalid_response',status:503,diagnostic:{kind:'invalid_response',httpStatus:201}})
  })

  it('keeps the read credential read-only after issuing a submission credential', async () => {
    const grants: unknown[] = []
    const app = new WorkshopGitHubApp({
      appId: '123', installationId: '456', repositoryOwner: 'titanxxh', repositoryName: 'open-agricola',
      privateKey: generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      fetchImpl: async (_url, init) => {
        const grant = JSON.parse(String(init?.body))
        grants.push(grant)
        return Response.json({ token: `${grant.permissions.contents}-token`, expires_at: new Date(Date.now() + 3600_000).toISOString() })
      },
    })
    expect(await app.token('read')).toBe('read-token')
    expect(await app.token('write')).toBe('write-token')
    expect(await app.token('read')).toBe('read-token')
    expect(grants).toEqual([
      { repositories: ['open-agricola'], permissions: { contents: 'read', pull_requests: 'read' } },
      { repositories: ['open-agricola'], permissions: { contents: 'write', pull_requests: 'write' } },
    ])
  })
})
