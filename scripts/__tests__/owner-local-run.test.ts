import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_TASK_IDS, type FullTaskId, type VerificationCommand } from '../ci/verification-tasks'
import { ACL_FIXTURE_IMAGE, BROWSER_PORT_SLICES, HARNESS_POSTGRES_ARGS, TASK_FIXTURE_IMAGES, TASK_ORDER, aclFixtureBuild, budgetPool, isolationSmokeImage, taskCost, assertNoReservedCandidatePaths, browserEnvironment, assertPrivateHome, pool, runIsolated, semaphore, taskEnvironment, type Inputs, type Runner } from '../ci/owner-local-run'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const sha = 'c'.repeat(40), producer = 'd'.repeat(40)
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function inputs(channel: 'stable' | 'prerelease'): Inputs {
  const output = mkdtempSync(join(tmpdir(), 'oa-owner-local-')); chmodSync(output, 0o700); roots.push(output)
  for (const directory of ['logs', 'diagnostics', 'source']) mkdirSync(join(output, directory), { mode: 0o700 })
  const assets = join(output, 'assets')
  execFileSync('git', ['init', '--quiet', assets]); execFileSync('git', ['-C', assets, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '--allow-empty', '-m', 'assets'])
  const commands = Object.fromEntries(FULL_TASK_IDS.map(id => [id, id === 'build'
    ? [{ command: 'pnpm', args: ['run', channel === 'prerelease' ? 'build:hosted-frontend' : 'build'] }, { command: 'pnpm', args: ['run', 'check:bundle-size'] }]
    : id === 'fast' ? [{ command: 'node', args: ['scripts/local-services.mjs', '--test'] }, { command: 'pnpm', args: ['test:fast'] }]
      : [{ command: 'pnpm', args: ['verify', `${id}.spec.ts`] }]])) as Record<FullTaskId, VerificationCommand[]>
  return { channel, sha, producerSha: producer, output, jobs: 4, repository: 'titanxxh/open-agricola', repositoryId: 123, tree: 'e'.repeat(40),
    configuration: 'a'.repeat(64), producerConfiguration: 'b'.repeat(64), commands, ownerUid: 1000,
    node: { path: '/opt/oa-owner-local/node/bin/node', version: 'v24.19.0', sha256: 'f'.repeat(64) }, dockerVersion: '29.6.2',
    policyFiles: { 'scripts/ci/owner-local-run.ts': '1'.repeat(64) }, servicePorts: { postgres: 41001, objects: 41002 }, retries: 1, testWorkers: 6, publicAssets: assets, profile: false, browserJobs: 2, ownerHome: '/home/owner', lanes: 3, cpuBudget: 20 }
}

/** Records every call; each candidate command writes its log and exits with the configured code. */
function fakeRunner(value: Inputs, { exit = {} as Record<string, number>, changed = [] as string[], startFails = false } = {}) {
  const calls: string[] = [], running = { now: 0, max: 0 }
  const runner: Runner = {
    async candidate(execution, command, args, phase, environment, properties) {
      calls.push(`candidate ${phase} ${execution.work} ${command} ${args.join(' ')} ${JSON.stringify(environment)} ${properties.join(',')}`)
      writeFileSync(join(execution.privateDirectory, `${phase}.log`), `log ${phase}\n`, { flag: 'wx' })
      running.now++; running.max = Math.max(running.max, running.now)
      await new Promise(done => setTimeout(done, 1))
      running.now--
      return exit[phase] ?? 0
    },
    isolation(args, log) {
      calls.push(`isolation ${args.join(' ')}`)
      writeFileSync(log, `isolation ${args[0]}\n`, { flag: 'wx' })
      if (startFails && args[0] === 'start') throw new Error('Owner-local isolation start failed')
    },
    verifySources(_, work) { calls.push(`verify ${work}`); if (changed.some(task => work.endsWith(`/${task}`))) throw new Error('Changed candidate source: x') },
    collectDiagnostics(work) { calls.push(`diagnostics ${work}`) },
  }
  return { runner, calls, running, value }
}

describe('owner-local task environment and scheduling', () => {
  it('marks only the pre hosted production build as the prerelease channel', () => {
    const hosted = { command: 'pnpm', args: ['run', 'build:hosted-frontend'] }
    expect(taskEnvironment('prerelease', sha, 'build', hosted)).toEqual({ GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'prerelease', RELEASE_CHANNEL: 'prerelease' })
    expect(taskEnvironment('prerelease', sha, 'build', { command: 'pnpm', args: ['run', 'build:replay-viewer'] }).RELEASE_CHANNEL).toBe('stable')
    expect(taskEnvironment('prerelease', sha, 'fast', { command: 'pnpm', args: ['test:fast'] })).toEqual({ GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'prerelease', RELEASE_CHANNEL: 'stable' })
    expect(taskEnvironment('stable', sha, 'build', hosted)).toEqual({ GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: 'stable', RELEASE_CHANNEL: 'stable' })
  })

  it('schedules every canonical task once, longest first, within the job limit', async () => {
    expect([...TASK_ORDER].sort()).toEqual([...FULL_TASK_IDS].sort())
    let active = 0, max = 0
    const started: number[] = []
    const result = await pool([1, 2, 3, 4, 5], 2, async item => { started.push(item); active++; max = Math.max(max, active); await new Promise(done => setTimeout(done, 2)); active--; return item * 10 })
    expect(result).toEqual([10, 20, 30, 40, 50])
    expect(started).toEqual([1, 2, 3, 4, 5])
    expect(max).toBe(2)
    await expect(pool([1], 0, async item => item)).rejects.toThrow(/positive integer/)
  })

  it('never runs more browser tasks at once than the browser limit while other tasks proceed', async () => {
    const value = inputs('stable'), browsers = { now: 0, max: 0 }, all = { now: 0, max: 0 }
    const fake = fakeRunner(value)
    const candidate = fake.runner.candidate
    fake.runner.candidate = async (execution, command, args, phase, environment, properties) => {
      const browser = /^task-(chromium|webkit|browser-sandbox)/.test(phase), task = phase.startsWith('task-')
      if (browser) { browsers.now++; browsers.max = Math.max(browsers.max, browsers.now) }
      if (task) { all.now++; all.max = Math.max(all.max, all.now) }
      try { await new Promise(done => setTimeout(done, 3)); return await candidate(execution, command, args, phase, environment, properties) }
      finally { if (browser) browsers.now--; if (task) all.now-- }
    }
    const result = await runIsolated({ ...value, jobs: 10, browserJobs: 2 }, fake.runner)
    expect('failed' in result).toBe(false)
    expect(browsers.max).toBe(2)
    expect(all.max).toBeGreaterThan(2)
    const limited = semaphore(1), order: number[] = []
    await Promise.all([1, 2, 3].map(item => limited(async () => { order.push(item); await new Promise(done => setTimeout(done, 1)) })))
    expect(order).toEqual([1, 2, 3])
    expect(() => semaphore(0)).toThrow(/positive integer/)
  })
})

describe('owner-local CPU budget scheduling', () => {
  async function trace(items: string[], budget: number, cost: (item: string) => number | 'exclusive') {
    const events: string[] = [], running = new Set<string>()
    let peak = 0
    await budgetPool(items, budget, cost, async item => {
      running.add(item); events.push(`+${item}`)
      const price = cost(item)
      peak = Math.max(peak, [...running].reduce((sum, name) => sum + (cost(name) === 'exclusive' ? budget : cost(name) as number), 0))
      if (price === 'exclusive') expect(running.size).toBe(1)
      await new Promise(done => setTimeout(done, 2))
      running.delete(item); events.push(`-${item}`)
    })
    return { events, peak }
  }

  it('runs exclusive items alone in order and fills the budget with the rest', async () => {
    const costs: Record<string, number | 'exclusive'> = { fast: 'exclusive', slow: 'exclusive', a: 8, b: 8, c: 8, d: 2, e: 2 }
    const { events, peak } = await trace(['fast', 'slow', 'a', 'b', 'c', 'd', 'e'], 20, item => costs[item])
    expect(events.slice(0, 4)).toEqual(['+fast', '-fast', '+slow', '-slow'])
    expect(peak).toBeLessThanOrEqual(20)
    // a and b fill 16, then the small d and e fit before c, which waits for a lane budget.
    expect(events.slice(4, 8)).toEqual(['+a', '+b', '+d', '+e'])
  })

  it('still runs an item costlier than the whole budget, alone', async () => {
    const { events } = await trace(['big', 'small'], 4, item => item === 'big' ? 10 : 1)
    expect(events).toEqual(['+big', '-big', '+small', '-small'])
    await expect(budgetPool([1], 0, () => 1, async () => {})).rejects.toThrow(/positive integer/)
    for (const jobs of [0, -1, Number.NaN, 1.5]) await expect(budgetPool([1], 4, () => 1, async () => {}, jobs)).rejects.toThrow(/job limit/)
  })

  it('prices the Vitest suites exclusive and browser lanes at two cores each', () => {
    expect(taskCost('fast', 2)).toBe('exclusive')
    expect(taskCost('slow', 2)).toBe('exclusive')
    expect(taskCost('chromium-3', 2)).toBe(4)
    expect(taskCost('webkit', 2) as number + (taskCost('browser-sandbox', 2) as number) + 4 * (taskCost('chromium-1', 2) as number)).toBe(20)
    expect(TASK_ORDER.slice(0, 2)).toEqual(['fast', 'slow'])
  })
})

describe('owner-local browser task environment', () => {
  it('gives every browser task a disjoint port slice and lanes only to chromium tasks', () => {
    const slices = Object.values(BROWSER_PORT_SLICES).map(range => range!.split('-').map(Number))
    expect(slices).toHaveLength(6)
    for (const [first, last] of slices) { expect(first).toBeGreaterThanOrEqual(20000); expect(last).toBeLessThanOrEqual(32767); expect(last - first).toBeGreaterThanOrEqual(63) }
    for (const [index, [, last]] of slices.entries()) if (index + 1 < slices.length) expect(last).toBeLessThan(slices[index + 1][0])
    expect(browserEnvironment('chromium-2', 4)).toEqual({ TEST_PORT_RANGE: '22000-23999', VERIFY_PARALLEL_LANES: '4' })
    expect(browserEnvironment('webkit', 4)).toEqual({ TEST_PORT_RANGE: '28000-29999' })
    expect(browserEnvironment('fast', 4)).toEqual({})
  })
})

describe('owner-local preconditions', () => {
  it('requires an owner home closed to other users and a candidate tree without the reserved data path', () => {
    const stat = (mode: number) => () => ({ isDirectory: () => true, mode: 0o40000 | mode }) as unknown as ReturnType<typeof import('node:fs').statSync>
    expect(() => assertPrivateHome('/home/owner', stat(0o750))).not.toThrow()
    expect(() => assertPrivateHome('/home/owner', stat(0o700))).not.toThrow()
    expect(() => assertPrivateHome('/home/owner', stat(0o755))).toThrow(/chmod o-rwx/)
    expect(() => assertPrivateHome('/home/owner', stat(0o751))).toThrow(/must not be accessible/)
    expect(() => assertNoReservedCandidatePaths('')).not.toThrow()
    expect(() => assertNoReservedCandidatePaths('data\n')).toThrow(/reserves/)
  })
})

describe('isolated owner-local run', () => {
  it.each(['stable', 'prerelease'] as const)('writes a complete %s receipt bound to its logs and evidence after teardown', async channel => {
    const value = inputs(channel), fake = fakeRunner(value)
    const result = await runIsolated(value, fake.runner)
    if ('failed' in result) throw new Error(result.failed.join('; '))
    const isolation = fake.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])
    expect(isolation).toEqual(['start', 'stop', 'cleanup'])
    // Sources are verified only after the stop, for every task copy.
    const stopAt = fake.calls.findIndex(call => call.startsWith('isolation stop'))
    expect(fake.calls.slice(stopAt).filter(call => call.startsWith('verify')).length).toBe(FULL_TASK_IDS.length)
    expect(fake.calls.slice(0, stopAt).some(call => call.startsWith('verify'))).toBe(false)
    expect(fake.calls.filter(call => call.startsWith('candidate ')).slice(0, 3).map(call => call.split(' ')[1])).toEqual(['smoke-image', 'smoke', `install-${TASK_ORDER[0]}`])
    // The smoke's pinned image is pulled first by the trusted Docker CLI, so a registry stall can retry.
    expect(fake.calls.find(call => call.startsWith('candidate smoke-image '))).toContain(` docker pull --quiet ${isolationSmokeImage()} `)
    expect(fake.calls.some(call => call.startsWith('candidate services ') && call.includes('scripts/local-services.mjs --test'))).toBe(true)
    // Images that tasks start themselves are pulled, and the ACL fixture built, before the services and every task.
    const phases = fake.calls.filter(call => call.startsWith('candidate ')).map(call => call.split(' ')[1])
    const prepared = ['browsers', ...TASK_FIXTURE_IMAGES.map((_, index) => `fixture-image-${index + 1}`), 'acl-fixture-image', 'services'].map(phase => phases.indexOf(phase))
    expect(prepared.every((index, i) => index > (prepared[i - 1] ?? -1))).toBe(true)
    expect(prepared.at(-1)).toBeLessThan(phases.findIndex(phase => phase.startsWith('task-')))
    for (const [index, { image }] of TASK_FIXTURE_IMAGES.entries()) expect(fake.calls.find(call => call.startsWith(`candidate fixture-image-${index + 1} `))).toContain(` docker pull --quiet ${image} `)
    // Every candidate command, preparation included, uses the run's own service ports.
    const candidateCalls = fake.calls.filter(call => call.startsWith('candidate '))
    expect(candidateCalls.every(call => call.includes(`"LOCAL_POSTGRES_PORT":"41001","LOCAL_S3_PORT":"41002","LOCAL_POSTGRES_ARGS":"${HARNESS_POSTGRES_ARGS}","TMPDIR":"/home/oa-candidate/tmp","PUBLIC_ASSET_VALIDATION_DIR":"/home/oa-candidate/public-assets","E2E_PUBLIC_ASSET_DIR":"/home/oa-candidate/public-assets","VITEST_MAX_WORKERS":"6"`) && call.includes(' PrivateTmp=yes,InaccessiblePaths=/home/owner'))).toBe(true)
    // The browser wave starts only after every CPU-bound task finished.
    const taskStarts = candidateCalls.filter(call => call.startsWith('candidate task-')).map(call => call.split(' ')[1].replace(/^task-|-\d+$/g, ''))
    expect(taskStarts.slice(0, taskStarts.findIndex(task => task.startsWith('chromium')))).toEqual(['fast', 'fast', 'slow'])
    expect(taskStarts.findIndex(task => task.startsWith('chromium'))).toBeGreaterThan(taskStarts.lastIndexOf('fast'))
    const receipt = JSON.parse(readFileSync(result.receipt, 'utf8'))
    expect(receipt.tasks.map((task: { id: string }) => task.id)).toEqual([...FULL_TASK_IDS])
    expect(receipt.tasks.flatMap((task: { commands: unknown[] }) => task.commands).every((command: { exitCode: number }) => command.exitCode === 0)).toBe(true)
    // Recorded commands keep their canonical spelling; only execution uses the trusted toolchain paths.
    expect(receipt.tasks.find((task: { id: string }) => task.id === 'fast').commands[0]).toEqual({ command: 'node', args: ['scripts/local-services.mjs', '--test'], exitCode: 0, logSha256: sha256('log task-fast-0\n') })
    expect(fake.calls.some(call => call.startsWith('candidate task-fast-0 /home/oa-candidate/work/fast /opt/oa-owner-local/node/bin/node scripts/local-services.mjs'))).toBe(true)
    expect(receipt).toMatchObject({ repository: 'titanxxh/open-agricola', repositoryId: 123, testedSha: sha, candidateSha: sha,
      environment: { node: 'v24.19.0', nodeExecutable: '/opt/oa-owner-local/node/bin/node', platform: process.platform, arch: process.arch } })
    const evidence = readFileSync(result.evidence, 'utf8')
    if (channel === 'stable') expect(receipt).toMatchObject({ format: 1, kind: 'owner-local-verification' })
    else expect(receipt).toMatchObject({ format: 2, kind: 'owner-local-prerelease-verification', channel: 'prerelease', producerSha: producer,
      execution: { kind: 'docker-isolated', evidenceSha256: sha256(evidence) } })
    expect(JSON.parse(evidence)).toMatchObject({ candidate: { sha }, producer: { sha: producer }, sandbox: { uid: 61000, rootlessDocker: '29.6.2', noNewPrivileges: true },
      sourceIntegrity: { verifiedAfterTeardown: [...FULL_TASK_IDS] } })
    expect(fake.running.max).toBeGreaterThan(1)
  })

  it('retries a failed task alone after every wave and records the successful attempt with every attempt in the evidence', async () => {
    const value = inputs('stable'), fake = fakeRunner(value, { exit: { 'task-fast-1': 1 } })
    const result = await runIsolated(value, fake.runner)
    if ('failed' in result) throw new Error(result.failed.join('; '))
    const phases = fake.calls.filter(call => call.startsWith('candidate task-')).map(call => call.split(' ')[1])
    expect(phases.indexOf('task-fast-r1-0')).toBeGreaterThan(phases.lastIndexOf('task-browser-sandbox-0'))
    const receipt = JSON.parse(readFileSync(result.receipt, 'utf8'))
    expect(receipt.tasks.find((task: { id: string }) => task.id === 'fast').commands.map((command: { logSha256: string }) => command.logSha256))
      .toEqual([sha256('log task-fast-r1-0\n'), sha256('log task-fast-r1-1\n')])
    const attempts = JSON.parse(readFileSync(result.evidence, 'utf8')).attempts.filter((attempt: { id: string }) => attempt.id === 'fast')
    expect(attempts.map((attempt: { attempt: number; passed: boolean }) => [attempt.attempt, attempt.passed])).toEqual([[0, false], [1, true]])
  })

  it('records no receipt when a canonical command keeps failing, skips that task\'s later commands, and still tears down', async () => {
    const value = inputs('stable'), fake = fakeRunner(value, { exit: { 'task-fast-0': 1, 'task-fast-r1-0': 1 } })
    const result = await runIsolated(value, fake.runner)
    expect(result).toEqual({ failed: ['fast: node scripts/local-services.mjs --test exited 1'] })
    expect(fake.calls.some(call => call.startsWith('candidate task-fast-1 ') || call.startsWith('candidate task-fast-r1-1 '))).toBe(false)
    expect(fake.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])).toEqual(['start', 'stop', 'cleanup'])
    expect(existsSync(join(value.output, 'verification.json'))).toBe(false)
    expect(existsSync(join(value.output, 'execution-evidence.json'))).toBe(false)
  })

  it('records no receipt when a task copy changed its tracked sources', async () => {
    const value = inputs('prerelease'), fake = fakeRunner(value, { changed: ['webkit'] })
    expect(await runIsolated(value, fake.runner)).toEqual({ failed: ['webkit source: Changed candidate source: x'] })
    expect(existsSync(join(value.output, 'pre-verification.json'))).toBe(false)
  })

  it('retries a downloading preparation step with its own logs and gives up after three attempts', async () => {
    const slept: number[] = [], sleep = async (ms: number) => { slept.push(ms) }
    {
      const value = inputs('stable'), fake = fakeRunner(value, { exit: { services: 1, 'services-a1': 1 } })
      const result = await runIsolated(value, fake.runner, Date.now, sleep)
      if ('failed' in result) throw new Error(result.failed.join('; '))
      expect(fake.calls.filter(call => /^candidate services(-a\d)? /.test(call)).map(call => call.split(' ')[1])).toEqual(['services', 'services-a1', 'services-a2'])
      expect(JSON.parse(readFileSync(result.evidence, 'utf8')).prerequisites.preparation.filter((row: { phase: string }) => row.phase.startsWith('services'))
        .map((row: { phase: string; exitCode: number }) => [row.phase, row.exitCode])).toEqual([['services', 1], ['services-a1', 1], ['services-a2', 0]])
      const failing = inputs('stable'), down = fakeRunner(failing, { exit: { services: 1, 'services-a1': 1, 'services-a2': 1 } })
      expect(await runIsolated(failing, down.runner, Date.now, sleep)).toEqual({ failed: ['Candidate services failed (exit 1)'] })
      expect(down.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])).toEqual(['start', 'stop', 'cleanup'])
      expect(slept).toEqual([5_000, 5_000, 5_000, 5_000])
    }
  })

  it('retries the smoke image pull but never reruns the smoke itself', async () => {
    const slept: number[] = [], sleep = async (ms: number) => { slept.push(ms) }
    const value = inputs('stable'), fake = fakeRunner(value, { exit: { 'smoke-image': 1 } })
    const result = await runIsolated(value, fake.runner, Date.now, sleep)
    if ('failed' in result) throw new Error(result.failed.join('; '))
    expect(fake.calls.filter(call => /^candidate smoke/.test(call)).map(call => call.split(' ')[1])).toEqual(['smoke-image', 'smoke-image-a1', 'smoke'])
    const once = inputs('stable'), failed = fakeRunner(once, { exit: { smoke: 1 } })
    expect(await runIsolated(once, failed.runner, Date.now, sleep)).toEqual({ failed: ['Candidate smoke failed (exit 1)'] })
    expect(failed.calls.filter(call => call.startsWith('candidate smoke ')).length).toBe(1)
    expect(isolationSmokeImage()).toMatch(/^postgres:[\w.-]+@sha256:[0-9a-f]{64}$/)
    // Fixture images stay the ones their tasks start; the ACL fixture builds on the isolation test's pinned Ubuntu.
    for (const { image, file } of TASK_FIXTURE_IMAGES) expect(readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8'), file).toContain(`'${image}'`)
    expect(aclFixtureBuild()).toContain(`'FROM ${TASK_FIXTURE_IMAGES[0].image}'`)
    expect(aclFixtureBuild()).toContain(`docker build --quiet -t ${ACL_FIXTURE_IMAGE} -`)
    expect(readFileSync(resolve(import.meta.dirname, '../../docker-compose.local.yml'), 'utf8')).toContain('command: postgres -c max_locks_per_transaction=1024 ${LOCAL_POSTGRES_ARGS:-}')
  })

  it('tears down after a failed preparation or a partly failed start', async () => {
    const smoke = inputs('stable'), failedSmoke = fakeRunner(smoke, { exit: { smoke: 1 } })
    expect(await runIsolated(smoke, failedSmoke.runner)).toEqual({ failed: ['Candidate smoke failed (exit 1)'] })
    expect(failedSmoke.calls.some(call => call.startsWith('candidate task-'))).toBe(false)
    expect(failedSmoke.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])).toEqual(['start', 'stop', 'cleanup'])
    const start = inputs('stable'), failedStart = fakeRunner(start, { startFails: true })
    expect(await runIsolated(start, failedStart.runner)).toMatchObject({ failed: ['Owner-local isolation start failed'] })
    expect(failedStart.calls.filter(call => call.startsWith('isolation')).map(call => call.split(' ')[1])).toEqual(['start', 'stop', 'cleanup'])
  })
})
