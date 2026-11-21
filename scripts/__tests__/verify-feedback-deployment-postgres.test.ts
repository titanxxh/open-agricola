// @covers server/bug-report/feedback-owner-cli.ts scripts/release/verify-feedback-deployment.ts
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createTestDatabase, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { disposeFeedbackDeploymentFixtures, feedbackDeploymentFixture, ownerLocalFeedbackDeploymentFixture,
  resetFeedbackDeploymentFixtures } from './_helpers/feedback-deployment-fixture'

// feedback-owner-cli.ts runs from the candidate's app container in production, so these cases stay in release
// verification; the rest of the feedback deployment flow is in the tooling project (verify-feedback-deployment.test.ts).
const repository = resolve(import.meta.dirname, '../..')
afterEach(resetFeedbackDeploymentFixtures)
afterAll(disposeFeedbackDeploymentFixtures)

describe('owner verified feedback deployment through PostgreSQL', () => {
  it.each(['native', 'owner-local'] as const)('records and retries the original %s operation through the actual PostgreSQL owner process', async kind => {
    const value = kind === 'owner-local' ? await ownerLocalFeedbackDeploymentFixture() : await feedbackDeploymentFixture()
    expect((await value.confirm()).status).toBe(0)
    const receipt: unknown = JSON.parse(readFileSync(join(value.root, 'receipt.json'), 'utf8'))
    if (!receipt || typeof receipt !== 'object' || !('operationId' in receipt)) throw new Error('No operation identity')
    const db = await createTestDatabase()
    try {
      const schema = await db.prepare('SELECT current_schema() AS name').get<{name: string}>()
      if (!schema?.name.startsWith('test_')) throw new Error('Expected isolated PostgreSQL schema')
      const run = (args: string[], data?: unknown) => new Promise<{status:number|null;stdout:string;stderr:string}>((resolve, reject) => {
        const child = spawn(join(repository, 'node_modules/.bin/tsx'), [join(repository, 'server/bug-report/feedback-owner-cli.ts'), ...args], {
          cwd: repository, env: {...process.env, CI:'', GITHUB_ACTIONS:'', DATABASE_URL:getTestDatabaseUrl(), DATABASE_SCHEMA:schema.name},
        })
        let stdout='', stderr=''
        child.stdout.on('data', chunk => {stdout+=chunk}); child.stderr.on('data', chunk => {stderr+=chunk})
        child.on('error', reject); child.on('close', status => resolve({status,stdout,stderr}))
        child.stdin.end(data === undefined ? '' : JSON.stringify(data))
      })
      const first = await run(['record'], receipt)
      expect(first.status, first.stderr).toBe(0)
      expect(JSON.parse(first.stdout)).toMatchObject({operationId:receipt.operationId,kind:'deployment',status:'completed',error:null})
      const listed = await run(['status'])
      expect(listed.status, listed.stderr).toBe(0)
      expect(JSON.parse(listed.stdout)).toEqual([JSON.parse(first.stdout)])
      const retried = await run(['retry'], {operationId:receipt.operationId})
      expect(retried.status, retried.stderr).toBe(0)
      expect(JSON.parse(retried.stdout)).toMatchObject({operationId:receipt.operationId,status:'completed',error:null})
      const replayed = await run(['record'], receipt)
      expect(replayed.status, replayed.stderr).toBe(0)
      expect(JSON.parse(replayed.stdout)).toMatchObject({operationId:receipt.operationId,status:'completed'})
    } finally {await db.close()}
  })
})
