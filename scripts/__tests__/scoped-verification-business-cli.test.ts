import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const cli = join(root, 'scripts/ci/scoped-verification.ts')
const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))
const write = (cwd: string, file: string, content: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), content)
}
const files = [
  'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts',
  'shared/cards/__tests__/listener-purity-guard.test.ts', 'shared/cards/__tests__/A29_AleBenches.test.ts',
  'shared/actions/effects/__tests__/pay-supply-token.test.ts', 'shared/session/__tests__/serialization-cursor.test.ts',
  'server/__tests__/auth.test.ts', 'server/connection/__tests__/ws-server.test.ts', 'server/game/__tests__/room.test.ts',
  'server/__tests__/listener-purity-gate-session.test.ts',
  'server/__tests__/A029_AleBenches-session.test.ts', 'server/__tests__/A27_OvenSite-session.test.ts',
  'client/services/__tests__/gameTransport-reconnect.test.ts', 'client/services/__tests__/api-contract.test.ts',
  'tests/cost-pay-parity.test.ts', 'tests/game-sync-pipeline.test.ts', 'tests/protocol-types.test.ts', 'tests/serialization.test.ts',
  'scripts/__tests__/docs-budget.test.ts',
]
const browserFiles = [
  'hosted-password-login', 'oauth-onboarding', 'room-invitations', 'ws-dual-player', 'frontend-browser-scenario-matrix',
  'choice-previews', 'listener-lifecycle-room', 'room-animal-holders', 'game-context-recovery', 'replay-viewer-csp', 'local-sandbox',
]

function fixture(path: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'business-verification-cli-'))
  temporary.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = (title: string) => {
    git('add', '--', '.', ':(exclude)docs/superpowers/**')
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', title)
    return git('rev-parse', 'HEAD')
  }
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(cwd, `${directory}/.keep`, '')
  for (const file of files) write(cwd, file, '// behavior consumer\n')
  for (const name of browserFiles) write(cwd, `e2e-tests/${name}.spec.ts`, '// browser consumer\n')
  write(cwd, path, 'export const revision = 1\n')
  write(cwd, 'scripts/local-services.mjs', `import { appendFileSync } from 'node:fs'
appendFileSync(process.env.COMMAND_LOG, JSON.stringify(['local-services', ...process.argv.slice(2)]) + '\\n')
`)
  write(cwd, 'package.json', JSON.stringify({ scripts: { 'check:architecture': 'pnpm run lint && pnpm run check:dependencies' } }))
  write(cwd, '.gitignore', 'output/\nbin/\ncommands.jsonl\n')
  git('init', '-q', '--template=', '-b', 'main')
  git('config', 'user.email', 'business-scope@example.test')
  git('config', 'user.name', 'Business Scope Test')
  commit('baseline')
  git('checkout', '-qb', 'feature')
  write(cwd, path, 'export const revision = 2\n')
  const sha = commit('business change')
  const log = join(cwd, 'commands.jsonl')
  write(cwd, 'bin/pnpm', `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args) + '\\n');
if (process.env.FAIL_COMMAND && args.includes(process.env.FAIL_COMMAND)) process.exit(7);
`)
  chmodSync(join(cwd, 'bin/pnpm'), 0o755)
  const env: NodeJS.ProcessEnv = {
    ...process.env, GITHUB_SHA: sha, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '',
    COMMAND_LOG: log, PATH: join(cwd, 'bin') + delimiter + process.env.PATH,
  }
  const run = (...args: string[]) => spawnSync(join(root, 'node_modules/.bin/tsx'), [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 20_000 })
  const commands = (): unknown[] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((line): unknown => JSON.parse(line)) : []
  return { cwd, env, run, commands }
}

describe('business verification public CLI', () => {
  it('plans and executes complete room groups and declared WebSocket browsers', () => {
    const value = fixture('server/game/room.ts')
    const planned = value.run('plan', '--base', 'main')
    expect(planned.status, planned.stderr).toBe(0)
    const manifest: unknown = JSON.parse(planned.stdout)
    expect(manifest).toMatchObject({ mode: 'scoped', catalog_tasks: 'quality,build', browsers: 'chromium webkit' })
    const result = value.run('run', '--base', 'main', '--plan', 'output/verification/scoped-plan.json', '--partition', 'all')
    expect(result.status, result.stderr).toBe(0)
    expect(value.commands()).toEqual([
      ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-shared',
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts'],
      ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-client',
        'client/services/__tests__/api-contract.test.ts', 'client/services/__tests__/gameTransport-reconnect.test.ts'],
      ['local-services', '--test'], ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-server',
        'server/__tests__/auth.test.ts', 'server/__tests__/listener-purity-gate-session.test.ts',
        'server/connection/__tests__/ws-server.test.ts', 'server/game/__tests__/room.test.ts'],
      ['run', 'build:cards-manifest'],
      ['exec', 'vitest', 'run', '--project', 'fast-tests',
        'tests/cost-pay-parity.test.ts', 'tests/game-sync-pipeline.test.ts', 'tests/protocol-types.test.ts', 'tests/serialization.test.ts'],
      ['run', 'lint'], ['run', 'check:dependencies'], ['run', 'lint:i18n'],
      ['run', 'build'], ['run', 'build:replay-viewer'], ['run', 'check:bundle-size'],
      ['verify', 'e2e-tests/hosted-password-login.spec.ts', 'e2e-tests/oauth-onboarding.spec.ts',
        'e2e-tests/room-invitations.spec.ts', 'e2e-tests/ws-dual-player.spec.ts', '--browser=chromium'],
      ['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=chromium', '--grep', '@ws'],
      ['verify', 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', '--browser=webkit', '--grep', '@webkit'],
    ])
  }, 30_000)

  it('runs all rule projects, slow Session and canonical complete browser lanes for a payment change', () => {
    const value = fixture('shared/actions/payment/internal/execute.ts')
    const planned = value.run('plan', '--base', 'main')
    expect(planned.status, planned.stderr).toBe(0)
    const manifest: unknown = JSON.parse(planned.stdout)
    expect(manifest).toMatchObject({
      mode: 'scoped',
      catalog_tasks: 'quality,build,chromium-1,chromium-2,chromium-3,chromium-4,browser-sandbox,webkit',
    })
    const result = value.run('run', '--base', 'main')
    expect(result.status, result.stderr).toBe(0)
    expect(value.commands().filter(command => Array.isArray(command) && command[0] === 'exec')).toEqual([
      ['exec', 'vitest', 'run', '--project', 'fast-shared',
        'shared/actions/payment/internal/__tests__/pay.test.ts', 'shared/contract/__tests__/authoritative-command.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'fast-cards',
        'shared/cards/__tests__/A29_AleBenches.test.ts', 'shared/cards/__tests__/listener-purity-guard.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'fast-card-runtime',
        'shared/actions/effects/__tests__/pay-supply-token.test.ts', 'shared/session/__tests__/serialization-cursor.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'fast-client',
        'client/services/__tests__/api-contract.test.ts', 'client/services/__tests__/gameTransport-reconnect.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'fast-server',
        'server/__tests__/auth.test.ts', 'server/__tests__/listener-purity-gate-session.test.ts',
        'server/connection/__tests__/ws-server.test.ts', 'server/game/__tests__/room.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'fast-tests',
        'tests/cost-pay-parity.test.ts', 'tests/game-sync-pipeline.test.ts', 'tests/protocol-types.test.ts', 'tests/serialization.test.ts'],
      ['exec', 'vitest', 'run', '--project', 'slow',
        'server/__tests__/A029_AleBenches-session.test.ts', 'server/__tests__/A27_OvenSite-session.test.ts'],
    ])
    expect(value.commands().filter(command => Array.isArray(command) && (command[0] === 'verify' || command[0] === 'run' && command[1] !== 'build:cards-manifest'))).toEqual([
      ['run', 'lint'], ['run', 'check:dependencies'], ['run', 'lint:i18n'],
      ['run', 'build'], ['run', 'build:replay-viewer'], ['run', 'check:bundle-size'],
      ['verify', '--shard=1/4'], ['verify', '--shard=2/4'], ['verify', '--shard=3/4'], ['verify', '--shard=4/4'],
      ['run', 'verify:e2e:browser-sandbox'], ['run', 'verify:e2e:webkit'],
    ])
  }, 30_000)

  it('rejects an edited protocol plan that omits its frontend consumers', () => {
    const value = fixture('shared/contract/protocol/ws.ts')
    const planned = value.run('plan', '--base', 'main')
    expect(planned.status, planned.stderr).toBe(0)
    const savedPath = 'output/verification/scoped-plan.json'
    const saved: unknown = JSON.parse(readFileSync(join(value.cwd, savedPath), 'utf8'))
    if (typeof saved !== 'object' || saved === null || !('checks' in saved) || !Array.isArray(saved.checks)) throw new Error('Missing planned checks')
    write(value.cwd, savedPath, JSON.stringify({ ...saved, checks: saved.checks.filter((check: unknown) =>
      typeof check !== 'object' || check === null || !('project' in check) || check.project !== 'fast-client') }))

    const result = value.run('run', '--base', 'main', '--plan', savedPath)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('differs from the canonical repository plan')
    expect(value.commands()).toEqual([])
  }, 30_000)

  it.each([
    { path: 'server/game/room.ts', failure: 'verify', error: 'Selected browser check failed' },
    { path: 'shared/actions/payment/internal/execute.ts', failure: 'slow', error: 'Selected vitest check failed' },
  ])('fails the public execution when the required $failure command fails', ({ path, failure, error }) => {
    const value = fixture(path)
    value.env.FAIL_COMMAND = failure
    const result = value.run('run', '--base', 'main', '--partition', 'all')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(error)
    const recorded: unknown = JSON.parse(readFileSync(join(value.cwd, 'output/verification/scoped-result.json'), 'utf8'))
    expect(recorded).toMatchObject({ kind: 'routine', status: 'failed', error: expect.stringContaining(error) })
  }, 30_000)
})
