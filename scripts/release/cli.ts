import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, webkit, type Browser } from '@playwright/test'
import { PostgresDatabase } from '../../server/database/postgres'
import { sourceFingerprint } from '../verify'
import { createFailureRecorder, parseSmokeTarget, runReleaseSmoke, writeEvidence, type ReleaseFailureStage } from './smoke'
import { readSoloDurability } from './durability'

export async function releaseSmokeCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { values } = parseArgs({ args, options: {
    'app-url': { type: 'string' }, 'api-url': { type: 'string' }, output: { type: 'string', default: 'output/release-smoke' },
    browser: { type: 'string', default: 'chromium' }, 'expected-build': { type: 'string' }, proxy: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) {
    console.log('pnpm release:smoke --app-url URL/open-agricola/ --api-url ORIGIN --expected-build SHA [--output DIR] [--browser chromium|webkit] [--proxy URL]\nRemote targets require HTTPS; loopback may use HTTP.\nPrivate environment: RELEASE_SMOKE_USERNAME, RELEASE_SMOKE_PASSWORD, DATABASE_URL, optional DATABASE_SCHEMA. Creates two owned solo games; retries reuse saved rooms.')
    return
  }
  assert.ok(values['app-url'] && values['api-url'], 'Usage: pnpm release:smoke --app-url URL/open-agricola/ --api-url ORIGIN --expected-build SHA [--output DIR] [--browser chromium|webkit] [--proxy URL]')
  assert.ok(values['expected-build'], 'Set the expected build explicitly')
  assert.ok(env.RELEASE_SMOKE_USERNAME && env.RELEASE_SMOKE_PASSWORD && env.DATABASE_URL, 'Configure RELEASE_SMOKE_USERNAME, RELEASE_SMOKE_PASSWORD and DATABASE_URL through the private environment')
  assert.ok(values.browser === 'chromium' || values.browser === 'webkit', 'Unsupported browser')
  const target = parseSmokeTarget(values['app-url'], values['api-url'], values['expected-build'])
  const proxy = values.proxy ?? env.RELEASE_SMOKE_PROXY
  const output = resolve(values.output), root = resolve(import.meta.dirname, '../..')
  const source = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), fingerprint: sourceFingerprint(root) }
  writeEvidence(output, 'result.json', { status: 'running', source, target, startedAt: new Date().toISOString() })
  let browser: Browser | undefined
  let db: PostgresDatabase | undefined
  let proof: object | undefined
  let primaryFailure: Error | undefined
  let stage: ReleaseFailureStage = 'launch-browser'
  const recordFailure = createFailureRecorder(output, () => ({ entries: [], dropped: 0 }))
  try {
    browser = await (values.browser === 'webkit' ? webkit : chromium).launch({
      ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1,[::1]' } } : {}),
    })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    stage = 'browser-smoke'
    const evidence = await runReleaseSmoke({ page: await context.newPage(), target, outputDirectory: output,
      credentials: { username: env.RELEASE_SMOKE_USERNAME, password: env.RELEASE_SMOKE_PASSWORD }, failureRecorder: recordFailure })
    stage = 'durability'
    db = new PostgresDatabase({ connectionString: env.DATABASE_URL, schema: env.DATABASE_SCHEMA })
    const rooms = []
    for (const room of evidence.rooms) {
      const durable = await readSoloDurability({ db, roomId: room.roomId, ownerId: evidence.ownerId, mode: room.mode,
        expected: { occupationHand: room.snapshot.occupationHand, minorHand: room.snapshot.minorHand } })
      assert.equal(durable.step0.frameHash, room.step0Hash)
      rooms.push(durable)
    }
    stage = 'source-validation'
    assert.equal(sourceFingerprint(root), source.fingerprint, 'Tool or source changed during verification')
    proof = { source, target, expectedBuild: values['expected-build'], browser: values.browser, rooms,
      logout: evidence.logout, commandTypes: evidence.commandTypes, proxyConfigured: Boolean(proxy),
      renderedAssets: evidence.rooms.map(room => ({ roomId: room.roomId, assets: room.renderedAssets })) }
  } catch (error) {
    primaryFailure = recordFailure(stage, error).error
  } finally {
    try { await db?.close() } catch (error) { primaryFailure = recordFailure('close-database', error).error }
    try { await browser?.close() } catch (error) { primaryFailure = recordFailure('close-browser', error).error }
  }
  if (primaryFailure) {
    writeEvidence(output, 'result.json', { status: 'failed', source, target, diagnosticFile: 'failure.json', completedAt: new Date().toISOString() })
    throw primaryFailure
  }
  assert.ok(proof)
  writeEvidence(output, 'result.json', { status: 'passed', ...proof, browserClosed: true, completedAt: new Date().toISOString() })
  console.log(`Release smoke passed: ${output}/result.json`)
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  releaseSmokeCli(process.argv.slice(2)).catch(() => { console.error('Release smoke failed. Check arguments, private configuration and output evidence.'); process.exitCode = 1 })
}
