import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { WorkshopGitHubApp } from '../github-app'

describe('Workshop App credentials', () => {
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
