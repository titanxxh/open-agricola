// @covers server/bug-report/feedback-owner-cli.ts server/bug-report/deployment-proof.ts
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestDatabase, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'

// feedback-owner-cli.ts runs from the candidate's app container in production, so these cases stay in release
// verification. The owner tools that assemble and send the deployment receipt are tested in the owner repository.
const repository = resolve(import.meta.dirname, '../..')
const sha = 'a'.repeat(40), version = 'v9.9.9', observedAt = Date.now()

function receipt(kind: 'native' | 'owner-local') {
  const configuration = 'c'.repeat(64), requiredTaskIds = ['fast', 'chromium-1']
  const ownerLocalUrl = `https://github.com/titanxxh/open-agricola/releases/download/${version}/owner-local-verification.json`
  const tasks = requiredTaskIds.map((id, index) => kind === 'native'
    ? { id, status: 'passed', reason: null, runId: 101, jobId: 201 + index, url: `https://github.com/titanxxh/open-agricola/actions/runs/101/job/${201 + index}` }
    : { id, status: 'passed', reason: 'Owner-authorized local candidate verification', runId: null, jobId: null, url: ownerLocalUrl })
  const candidate = { status: 'passed', repository: 'titanxxh/open-agricola', sha, configuration, requiredTaskIds, tasks,
    ...(kind === 'owner-local' ? { ownerLocal: { kind: 'owner-local', configuration, producerConfiguration: 'd'.repeat(64),
      receiptSha256: 'e'.repeat(64), statusId: 11, releaseId: 12, assetId: 13, ownerId: 14, url: ownerLocalUrl } } : {}) }
  return { operationId: randomUUID(), proof: { repository: 'titanxxh/open-agricola', observedAt,
    release: { version, url: `https://github.com/titanxxh/open-agricola/releases/tag/${version}`, sha, tagSha: sha, draft: false, prerelease: false, publishedAt: observedAt - 1000 },
    candidate,
    frontend: { format: 1, gameBuildId: sha, basePath: '/open-agricola/', url: 'https://agricola.test/open-agricola/frontend-build.json' },
    backend: { gameBuildId: sha, running: true, ready: true, containerId: 'f'.repeat(64) },
    ancestry: { format: 'git-raw-closure-v1', commits: [sha, 'b'.repeat(40)] } } }
}

describe('owner verified feedback deployment through PostgreSQL', () => {
  it.each(['native', 'owner-local'] as const)('records and retries the original %s operation through the actual PostgreSQL owner process', async kind => {
    const value = receipt(kind)
    const db = await createTestDatabase()
    try {
      const schema = await db.prepare('SELECT current_schema() AS name').get<{name: string}>()
      if (!schema?.name.startsWith('test_')) throw new Error('Expected isolated PostgreSQL schema')
      const run = (args: string[], data?: unknown, env: NodeJS.ProcessEnv = {}) => new Promise<{status:number|null;stdout:string;stderr:string}>((resolve, reject) => {
        const child = spawn(join(repository, 'node_modules/.bin/tsx'), [join(repository, 'server/bug-report/feedback-owner-cli.ts'), ...args], {
          cwd: repository, env: {...process.env, CI:'', GITHUB_ACTIONS:'', DATABASE_URL:getTestDatabaseUrl(), DATABASE_SCHEMA:schema.name, ...env},
        })
        let stdout='', stderr=''
        child.stdout.on('data', chunk => {stdout+=chunk}); child.stderr.on('data', chunk => {stderr+=chunk})
        child.on('error', reject); child.on('close', status => resolve({status,stdout,stderr}))
        child.stdin.end(data === undefined ? '' : JSON.stringify(data))
      })
      const refused = await run(['record'], value, { CI: 'true' })
      expect(refused.status).not.toBe(0)
      expect(refused.stderr).toContain('Owner feedback operations cannot run in CI')
      const altered = await run(['record'], { ...value, proof: { ...value.proof, release: { ...value.proof.release, prerelease: true } } })
      expect(altered.status).not.toBe(0)
      expect(altered.stderr).toContain('invalid_deployment_proof')
      const first = await run(['record'], value)
      expect(first.status, first.stderr).toBe(0)
      expect(JSON.parse(first.stdout)).toMatchObject({operationId:value.operationId,kind:'deployment',status:'completed',error:null})
      const listed = await run(['status'])
      expect(listed.status, listed.stderr).toBe(0)
      expect(JSON.parse(listed.stdout)).toEqual([JSON.parse(first.stdout)])
      const retried = await run(['retry'], {operationId:value.operationId})
      expect(retried.status, retried.stderr).toBe(0)
      expect(JSON.parse(retried.stdout)).toMatchObject({operationId:value.operationId,status:'completed',error:null})
      const replayed = await run(['record'], value)
      expect(replayed.status, replayed.stderr).toBe(0)
      expect(JSON.parse(replayed.stdout)).toMatchObject({operationId:value.operationId,status:'completed'})
    } finally {await db.close()}
  })
})
