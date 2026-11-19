import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { recoverSourceUpdate } from '../prerelease/live-acceptance/source-recovery.mjs'
import { loadAcceptanceConfig } from '../prerelease/live-acceptance/context.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function recoveryFixture(failSmoke = false, eligible = true) {
  const root = mkdtempSync(join(tmpdir(), 'oa-source-recovery-'))
  roots.push(root)
  const write = (name: string, value: unknown) => {
    const path = join(root, name)
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 })
    return path
  }
  const from = 'a'.repeat(40), to = 'b'.repeat(40), formal = 'c'.repeat(40)
  const generation = '11111111-1111-4111-8111-111111111111', id = '33333333-3333-4333-8333-333333333333'
  const targetConfig = write('target.json', { targetId: 'pre', directory: '/srv/pre', origin: 'https://pre.example',
    formal: { project: 'formal', apiOrigin: 'https://api.example', appOrigin: 'https://app.example' } })
  const accounts = write('accounts.json', { accounts: [{ id: 'a', username: 'participant', password: 'private' }] })
  const sourceProof = write('proof.json', { kind: 'prerelease-source', scope: 'routine', from, sha: to, producer: formal })
  const configPath = write('config.json', { format: 1, targetConfig, sourceProof, candidate: to, formalBuild: formal, ssh: 'owner', accounts,
    ownerCookie: write('cookie', 'cookie'), guardConfig: '/srv/guard', outputRoot: root })
  const windowPath = write('window.json', { format: 1, windowId: 'release', generation, formalFrom: formal, formalBuild: formal, run: root,
    previousRun: root, windowDirectory: root, exchangeDirectory: root, install: { from, to, sourceProof }, acceptanceRoom: generation })
  write('state.json', { windowId: 'release', ops: { reverify: id } })
  let live: Record<string, unknown> = { mode: 'maintenance', generation, installed: { buildId: to },
    operation: { id, kind: 'deploy', rollbackCompatible: eligible, buildId: to, sourceBuildId: from, stage: 'acceptance' } }
  const actions: string[] = []
  const ok = (value: unknown = '') => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '', error: null })
  const io = {
    setLog() {}, log() {}, fetch,
    run(command: string, args: string[]) {
      const option = (flag: string) => args[args.indexOf(flag) + 1]
      if (command === './deploy-prerelease.sh') {
        actions.push(args[0])
        if (args[0] === 'status') return ok(live)
        if (args[0] === 'rollback-source') {
          live = { mode: 'maintenance', generation, fingerprint: 'fingerprint', installed: { buildId: from, image: 'sha256:old' },
            operation: { id, kind: 'rollback', sourceBuildId: to, buildId: from, stage: 'acceptance' } }
          return ok(live)
        }
        if (args[0] === 'identities' || args[0] === 'apply-identities') return ok({ path: '/srv/identity' })
        if (args[0] === 'verify-formal-browser') return ok({ path: '/srv/formal-proof', sha256: 'a'.repeat(64), deployment: { buildId: formal } })
        if (args[0] === 'open-rollback-source') {
          const path = option('--acceptance'), data = readFileSync(path)
          expect(JSON.parse(data.toString())).toMatchObject({ operationId: id, buildId: from, evidence: {
            'source-smoke': { path: join(root, 'source-recovery/source-smoke.json') }, 'formal-browser-policy': { path: '/srv/formal-proof' } } })
          expect(option('--source-proof')).toBe(sourceProof)
          live = { ...live, mode: 'open', operation: null, acceptance: { formalBuildId: formal, sha256: createHash('sha256').update(data).digest('hex') } }
          return ok(live)
        }
      }
      if (command === process.execPath && args.includes('--suite')) {
        actions.push(option('--suite'))
        expect(loadAcceptanceConfig(option('--config')).config.candidate).toBe(from)
        if (failSmoke) return { status: 1, stdout: '', stderr: 'participant failed to reconnect', error: null }
        writeFileSync(join(option('--run'), 'result-source-smoke-chromium-1.json'), JSON.stringify({ engine: 'chromium', operationId: id,
          candidate: from, results: [{ passed: true, case: 'source-smoke' }] }))
      }
      if (command === 'ssh' && args.at(-1) === '-s') return ok(generation)
      return ok()
    },
  }
  return { invoke: () => recoverSourceUpdate({ configPath, windowPath, io }), actions }
}

it('recovers acceptance failures with a fresh source and formal proof and reconciles a lost open response', async () => {
  const recovery = recoveryFixture()
  expect(await recovery.invoke()).toBe(true)
  expect(recovery.actions).toEqual(['status', 'rollback-source', 'identities', 'apply-identities', 'source-smoke', 'verify-formal-browser',
    'identities', 'apply-identities', 'open-rollback-source'])
  recovery.actions.length = 0
  expect(await recovery.invoke()).toBe(true)
  expect(recovery.actions).toEqual(['status'])
})

it('leaves the previous source in maintenance when its participant cannot reconnect', async () => {
  const recovery = recoveryFixture(true)
  await expect(recovery.invoke()).rejects.toThrow('participant failed to reconnect')
  expect(recovery.actions.at(-1)).toBe('source-smoke')
})

it('keeps incompatible installations in maintenance without restarting the application', async () => {
  const recovery = recoveryFixture(false, false)
  expect(await recovery.invoke()).toBe('not-applicable')
  expect(recovery.actions).toEqual(['status'])
})
