import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REQUIRED_EVIDENCE } from '../prerelease/live-acceptance/evidence.mjs'
import {
  DISPOSABLE_AUTHORIZATION, LIMITS, SUITE_STEPS, WINDOW_STEPS, WindowStop, accountRequest, assertNoResidualRows, assertWithin, markStep, markThrough, newState, nextStep, openBinding, ownerNotes,
  parseWindowConfig, previousTeamRoom, rerunCommands, resetSteps, resumeDecision, reverifyOps, runDiagnostics, runWindow, staleSteps, suiteGaps, teamAccounts,
} from '../prerelease/live-acceptance/window.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const privateRoot = () => { const root = mkdtempSync(join(tmpdir(), 'oa-window-')); chmodSync(root, 0o700); roots.push(root); return root }
const privateDir = (root: string, name: string) => { const path = join(root, name); mkdirSync(path, { mode: 0o700 }); return path }
const writePrivate = (path: string, value: unknown) => { writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); return path }
const sha = (digit: string) => digit.repeat(40)
const zeroRows = { formal: { users: 0, beta_access: 0, sessions: 0 }, pre: { retained_identity_refs: 0, room_players: 0, users: 0 } }
const receipts = Object.fromEntries(['close', 'associations', 'identity-verified', 'audit', 'activate'].map(name => [name, { path: `/x/deletion-${name}.json`, sha256: 'a'.repeat(64) }]))
const row = (testCase: string, engine: string, passed: boolean, run: Record<string, unknown> = { mode: 'maintenance', publicStill503: true }) =>
  ({ engine, path: '/run/result.json', run, result: { case: testCase, passed } })

describe('window plan', () => {
  it('follows the C5 order and stops at the first unfinished step', () => {
    expect(WINDOW_STEPS.slice(0, 4)).toEqual(['preconditions', 'reverify', 'accounts', 'chain-initial'])
    expect(SUITE_STEPS.map(step => step.suite)).toEqual(['handoff', 'boundary', 'multihand', 'team', 'sandbox', 'viewer', 'continuity'])
    expect(WINDOW_STEPS.slice(4, 4 + SUITE_STEPS.length)).toEqual(SUITE_STEPS.map(step => step.step))
    expect(WINDOW_STEPS.slice(4 + SUITE_STEPS.length)).toEqual(['deletion', 'chain-deletion', 'deletion-rows', 'owner-notes', 'bundle', 'formal-browser', 'copy-evidence', 'final-open', 'readback', 'cleanup', 'archive'])
    let state = newState('c6', 1)
    expect(nextStep(state)).toBe('preconditions')
    state = markStep(markStep(state, 'preconditions', 'started', 2), 'preconditions', 'done', 3, { outputs: {} })
    expect(state.steps.preconditions).toMatchObject({ status: 'done', attempts: 1, startedAt: 2, finishedAt: 3 })
    expect(nextStep(state)).toBe('reverify')
    state = markStep(markStep(state, 'reverify', 'started', 4), 'reverify', 'failed', 5, { error: 'ssh dropped' })
    state = markStep(state, 'reverify', 'started', 6)
    expect(state.steps.reverify).toEqual({ status: 'started', attempts: 2, startedAt: 6 })
    expect(() => markStep(state, 'nope', 'started', 7)).toThrow(/Unknown window step/)
  })

  it('marks every unfinished step through a given step done without touching later ones', () => {
    const state = markThrough(markStep(newState('c6', 0), 'formal-browser', 'started', 1), 'final-open', 2, 'already open')
    expect(WINDOW_STEPS.slice(0, WINDOW_STEPS.indexOf('final-open') + 1).every(step => state.steps[step]?.status === 'done')).toBe(true)
    expect(state.steps['final-open']).toMatchObject({ status: 'done', note: 'already open', finishedAt: 2 })
    expect(state.steps.readback).toBeUndefined()
  })

  it('keeps one reverify operation id across attempts and mints a fresh close each time', () => {
    let next = 0
    const mint = () => `00000000-0000-4000-8000-00000000000${next++}`
    const first = reverifyOps(newState('c6', 1), mint)
    const state = { ...newState('c6', 1), ops: { reverify: first.reverify } }
    const second = reverifyOps(state, mint)
    expect(second.reverify).toBe(first.reverify)
    expect(second.close).not.toBe(first.close)
  })

  it('redoes an old formal browser proof and its evidence copy before opening, but never after open', () => {
    let state = markStep(markStep(newState('c6', 0), 'formal-browser', 'started', 0), 'formal-browser', 'done', 1_000)
    expect(staleSteps(state, 1_000 + 10 * 60_000)).toEqual([])
    expect(staleSteps(state, 1_000 + 26 * 60_000)).toEqual(['formal-browser', 'copy-evidence'])
    expect(resetSteps(state, ['formal-browser']).steps['formal-browser']).toBeUndefined()
    state = markStep(markStep(state, 'final-open', 'started', 2_000), 'final-open', 'done', 3_000)
    expect(staleSteps(state, 1_000 + 60 * 60_000)).toEqual([])
  })

  it('stops before a lifecycle limit instead of sending a request the authority would refuse', () => {
    expect(() => assertWithin('activate → open', 20_000, LIMITS.activateToOpenMs)).not.toThrow()
    expect(() => assertWithin('activate → open', 26_000, LIMITS.activateToOpenMs)).toThrow(WindowStop)
  })
})

describe('resume decisions', () => {
  const failed = { status: 'failed', attempts: 1 }
  it('reruns ordinary steps and finishes suites from evidence', () => {
    expect(resumeDecision('chain-initial', failed)).toEqual({ action: 'run' })
    expect(resumeDecision('suite-boundary', failed, { gaps: [] }).action).toBe('complete')
    expect(resumeDecision('suite-boundary', failed, { gaps: [{ case: 'revocation', engine: 'webkit' }] }).action).toBe('stop')
    expect(resumeDecision('reverify', undefined)).toEqual({ action: 'run' })
    expect(resumeDecision('reverify', { status: 'done' })).toEqual({ action: 'skip' })
  })
  it('never repeats account creation or deletion without an explicit confirmation', () => {
    expect(resumeDecision('accounts', failed).action).toBe('stop')
    expect(resumeDecision('accounts', { status: 'started' }, { confirmed: true })).toEqual({ action: 'check-accounts' })
    expect(resumeDecision('deletion', failed, { gaps: [{ case: 'formal-account-deletion', engine: 'chromium' }] }).action).toBe('stop')
    expect(resumeDecision('deletion', failed, { gaps: [{ case: 'formal-account-deletion', engine: 'chromium' }], confirmed: true })).toEqual({ action: 'run' })
    expect(resumeDecision('deletion', failed, { gaps: [] }).action).toBe('complete')
  })
})

describe('suite evidence', () => {
  it('lists missing pairs and the exact per-engine rerun commands', () => {
    const results = ['visitor', 'ordinary', 'beta-boundary', 'revocation'].flatMap(name => ['chromium', 'firefox', 'webkit']
      .map(engine => row(name, engine, !(name === 'revocation' && engine === 'webkit'))))
    const gaps = suiteGaps(results, 'boundary')
    expect(gaps).toEqual([{ case: 'revocation', engine: 'webkit' }])
    expect(rerunCommands({ configPath: '/cfg.json', runDirectory: '/run', room: null }, 'suite-boundary', gaps))
      .toEqual(['node --import tsx scripts/prerelease/live-acceptance/cli.mjs run --config /cfg.json --run /run --suite boundary --engine webkit --case revocation'])
  })
  it('does not count a maintenance run that could not prove pre stayed closed, and carries the Viewer room', () => {
    const gaps = suiteGaps([row('viewer-firefox', 'firefox', true), row('viewer-webkit', 'webkit', true, { mode: 'maintenance', publicStill503: false })], 'viewer')
    expect(gaps).toEqual([{ case: 'viewer-webkit', engine: 'webkit' }])
    expect(rerunCommands({ configPath: '/c', runDirectory: '/r', room: 'room-1' }, 'suite-viewer', gaps)[0]).toContain('--suite viewer --room room-1 --engine webkit --case viewer-webkit')
    expect(suiteGaps([row('public-readback', 'chromium', true, { mode: 'open' })], 'readback')).toEqual([])
  })
  it('reads the previous window team room and the per-run diagnostics', () => {
    const run = privateRoot()
    writePrivate(join(run, 'result-team-chromium-1.json'), { results: [{ case: 'team-game', passed: true, roomId: '11111111-1111-4111-8111-111111111111' }] })
    writePrivate(join(run, 'result-team-chromium-2.json'), { results: [{ case: 'team-game', passed: false, roomId: '22222222-2222-4222-8222-222222222222' }] })
    writePrivate(join(run, 'result-boundary-webkit-3.json'), { suite: 'boundary', engine: 'webkit', passed: true, networkRetries: ['formal me: Timeout'], boundedEvaluations: [] })
    writePrivate(join(run, 'result-handoff-chromium-4.json'), { suite: 'handoff', engine: 'chromium', passed: true, networkRetries: [], boundedEvaluations: [] })
    expect(previousTeamRoom(run)).toBe('11111111-1111-4111-8111-111111111111')
    expect(runDiagnostics(run)).toEqual([{ file: 'result-boundary-webkit-3.json', suite: 'boundary', engine: 'webkit', passed: true, networkRetries: ['formal me: Timeout'], boundedEvaluations: [] }])
    expect(() => previousTeamRoom(privateRoot())).toThrow(/no passing team game room/)
  })
})

describe('accounts and owner notes', () => {
  it('requests two labelled disposable accounts under the authorization the formal helper checks', () => {
    const request = accountRequest('33333333-3333-4333-8333-333333333333')
    expect(request.authorization).toBe(DISPOSABLE_AUTHORIZATION)
    expect(readFileSync(resolve(import.meta.dirname, '../prerelease/owner-accounts/create.mjs'), 'utf8')).toContain(`'${DISPOSABLE_AUTHORIZATION}'`)
    expect(request.accounts.map(account => account.label)).toEqual(['D', 'E'])
    for (const account of request.accounts) {
      expect(account.username).toMatch(new RegExp(`^preacc_${account.label.toLowerCase()}_[a-f0-9]{12}$`))
      expect(account.password.length).toBeGreaterThanOrEqual(24)
    }
    const team = teamAccounts(request, request.accounts.map(account => ({ label: account.label, id: `id-${account.label}`, username: account.username })))
    expect(team.accounts.map(account => account.id)).toEqual(['id-D', 'id-E'])
    expect(() => teamAccounts(request, [{ label: 'D', id: 'id-D', username: 'someone-else' }])).toThrow(/was not created as requested/)
  })
  it('generates the deletion and reverify notes; owner text only adds notes', () => {
    const notes = ownerNotes({ candidate: sha('c'), formalFrom: sha('a'), formalTo: sha('b'), rows: { D: zeroRows, E: zeroRows }, receipts, diagnostics: [] },
      { capacity: { note: 'provisional limits' }, 'deletion-audit': { remainingRows: { D: 'owner override' } }, 'retained-data': { dailyBackup: 'host cron' } })
    expect(notes['deletion-audit']).toEqual({ accounts: ['D', 'E'], remainingRows: { D: zeroRows, E: zeroRows }, receipts })
    expect(notes['retained-data']).toMatchObject({ reverify: { installed: sha('c'), formalFrom: sha('a'), formalTo: sha('b') }, dailyBackup: 'host cron' })
    expect(notes.capacity).toEqual({ note: 'provisional limits' })
  })
  it('refuses to bundle while a deleted account still has rows or a receipt is missing', () => {
    const left = { ...zeroRows, pre: { ...zeroRows.pre, room_players: 1 } }
    expect(() => ownerNotes({ candidate: sha('c'), formalFrom: sha('a'), formalTo: sha('b'), rows: { D: zeroRows, E: left }, receipts, diagnostics: [] })).toThrow(/still have rows \(E pre\.room_players=1\)/)
    expect(() => ownerNotes({ candidate: sha('c'), formalFrom: sha('a'), formalTo: sha('b'), rows: { D: zeroRows, E: zeroRows }, receipts: {}, diagnostics: [] })).toThrow(/receipt close/)
  })
})

describe('window config and restart rules', () => {
  const config = (root: string, extra = {}) => ({ format: 1, windowId: 'c6', generation: '44444444-4444-4444-8444-444444444444', formalFrom: sha('a'), formalBuild: sha('b'),
    previousRun: privateDir(root, 'previous'), run: privateDir(root, 'run'), windowDirectory: privateDir(root, 'window'), exchangeDirectory: '/tmp/oa-window-c6', ...extra })
  it('rejects unsafe or inconsistent window inputs', () => {
    const root = privateRoot(), valid = config(root)
    expect(parseWindowConfig(valid)).toBe(valid)
    expect(() => parseWindowConfig({ ...valid, exchangeDirectory: 'relative/dir' })).toThrow(/plain absolute path/)
    expect(() => parseWindowConfig({ ...valid, exchangeDirectory: '/tmp/../etc' })).toThrow(/plain absolute path/)
    expect(() => parseWindowConfig({ ...valid, formalFrom: sha('b') })).toThrow(/previous and new formal SHAs/)
    expect(() => parseWindowConfig({ ...valid, generation: 'gen' })).toThrow(/generation UUID/)
  })
  it('refuses to restart a started window without --resume, and to resume a window that never started', async () => {
    const root = privateRoot(), value = config(root), windowPath = writePrivate(join(root, 'window.json'), value)
    await expect(runWindow({ configPath: '/unused.json', windowPath, resume: true })).rejects.toThrow(/Nothing to resume/)
    writePrivate(join(value.windowDirectory, 'state.json'), newState('c6', 1))
    await expect(runWindow({ configPath: '/unused.json', windowPath })).rejects.toThrow(/already started/)
    writePrivate(join(value.windowDirectory, 'state.json'), newState('c5', 1))
    await expect(runWindow({ configPath: '/unused.json', windowPath, resume: true })).rejects.toThrow(/another window/)
    await expect(runWindow({ configPath: '/unused.json', windowPath, resume: true, confirmStep: 'bundle' })).rejects.toThrow(/only to accounts or deletion/)
  })
})

describe('window run with an injected runner', () => {
  // A fake host: records every command and answers like the real tools, failing the formal account helper.
  function fakeHost(candidate: string, generation: string, guardCycle = '55555555-5555-4555-8555-555555555555') {
    const calls: string[] = []
    const io = {
      setLog: () => {},
      fetch: async (url: string) => ({ status: 200, json: async () => (url.endsWith('/frontend-build.json') ? { gameBuildId: sha('b') }
        : url.endsWith('/browser-policy') ? { buildId: sha('b') } : { ok: true }) }),
      run(command: string, args: string[]) {
        const line = [command.endsWith('node') || command === process.execPath ? 'node' : command, ...args].join(' ')
        calls.push(line)
        const ok = (stdout = '') => ({ status: 0, stdout, stderr: '', error: null })
        if (command === 'git') return ok(args[0] === 'rev-parse' ? 'head\n' : '')
        if (command === './deploy-prerelease.sh' && args[0] === 'status') return ok(JSON.stringify({ installed: { buildId: candidate }, generation }) + '\n')
        if (command === './deploy-prerelease.sh' && args[0] === 'reverify') {
          return ok(JSON.stringify({ mode: 'maintenance', operation: { kind: 'reverify', id: args[args.indexOf('--operation-id') + 1] } }) + '\n')
        }
        if (command === 'ssh' && args.at(-1) === '-s') return ok(guardCycle + '\n')
        if (command === 'ssh' && args.at(-1)!.includes('rev-parse HEAD')) return ok('head\n')
        if (command === 'ssh' && args.at(-1)!.includes('typescript-runtime.mjs')) return { status: 1, stdout: '', stderr: 'helper exited', error: null }
        return ok()
      },
    }
    return { io, calls }
  }
  function acceptanceFiles(root: string, candidate: string) {
    const secrets = privateDir(root, 'secrets')
    const accounts = (labels: string[]) => ({ accounts: labels.map(label => ({ id: `id-${label}`, username: `user-${label}`, password: `password-${label}` })) })
    const target = writePrivate(join(secrets, 'target.json'), { origin: 'https://pre.example.test', directory: '/srv/pre', policyDirectory: '/srv/policy', database: { name: 'pre' },
      formal: { appOrigin: 'https://app.example.test', apiOrigin: 'https://api.example.test', project: 'formal' } })
    const receipt = writePrivate(join(secrets, 'receipt.json'), { purpose: 'candidate', channel: 'prerelease', sourceSha: candidate, producerSha: sha('d') })
    writeFileSync(join(secrets, 'cookie'), '__Host-oa-session=abc\n', { mode: 0o600 })
    return writePrivate(join(secrets, 'acceptance.json'), { format: 1, targetConfig: target, ssh: 'owner@host', candidate, candidateReceipt: receipt, formalBuild: sha('a'),
      accounts: writePrivate(join(secrets, 'accounts.json'), accounts(['A', 'B', 'C'])), teamAccounts: writePrivate(join(secrets, 'team.json'), accounts(['D', 'E'])),
      ownerCookie: join(secrets, 'cookie'), guardConfig: '/srv/guard.json', outputRoot: privateDir(root, 'output') })
  }

  it('reverifies once, keeps its operation id, and stops at an interrupted account creation until confirmed', async () => {
    const root = privateRoot(), candidate = sha('c'), generation = '44444444-4444-4444-8444-444444444444'
    const configPath = acceptanceFiles(root, candidate)
    const value = { format: 1, windowId: 'c6', generation, formalFrom: sha('a'), formalBuild: sha('b'), previousRun: privateDir(root, 'previous'), run: privateDir(root, 'run'),
      windowDirectory: privateDir(root, 'window'), exchangeDirectory: join(root, 'exchange') }
    const windowPath = writePrivate(join(root, 'window.json'), value)
    const host = fakeHost(candidate, generation)

    await expect(runWindow({ configPath, windowPath, io: host.io })).rejects.toThrow(/create helper failed/)
    const state = JSON.parse(readFileSync(join(value.windowDirectory, 'state.json'), 'utf8'))
    expect(Object.fromEntries(Object.entries(state.steps).map(([step, entry]) => [step, (entry as { status: string }).status])))
      .toEqual({ preconditions: 'done', reverify: 'done', accounts: 'failed' })
    expect(JSON.parse(readFileSync(configPath, 'utf8')).formalBuild).toBe(sha('b'))
    const reverify = host.calls.filter(call => call.startsWith('./deploy-prerelease.sh reverify'))
    expect(reverify).toHaveLength(1)
    expect(reverify[0]).toContain(`--operation-id ${state.ops.reverify}`)
    const close = host.calls.findIndex(call => call.includes('authority.ts close')), reverified = host.calls.findIndex(call => call.startsWith('./deploy-prerelease.sh reverify'))
    expect(close).toBeGreaterThan(-1)
    expect(close).toBeLessThan(reverified)

    const resumed = fakeHost(candidate, generation)
    await expect(runWindow({ configPath, windowPath, resume: true, io: resumed.io })).rejects.toThrow(/--confirm-step accounts/)
    expect(resumed.calls.some(call => call.includes('reverify'))).toBe(false)
    expect(resumed.calls.some(call => call.startsWith('./deploy-prerelease.sh status'))).toBe(true)
  })
})

describe('final open', () => {
  const candidate = sha('c'), generation = '44444444-4444-4444-8444-444444444444', reverifyOp = '66666666-6666-4666-8666-666666666666'
  const acceptance = { operationId: reverifyOp, buildId: candidate, generation, sha256: 'f'.repeat(64) }
  const openStatus = (extra = {}) => ({ mode: 'open', generation, installed: { buildId: candidate }, acceptance: { sha256: 'f'.repeat(64), formalBuildId: sha('b') }, ...extra })
  const binding = { candidate, generation, formalBuild: sha('b'), reverifyOperationId: reverifyOp, acceptance }

  it('treats an open target as ours only when its acceptance, build, generation and formal build all match', () => {
    expect(openBinding({ mode: 'maintenance' }, binding)).toBe('closed')
    expect(openBinding(openStatus(), binding)).toBe('ours')
    expect(openBinding(openStatus({ acceptance: { sha256: 'e'.repeat(64), formalBuildId: sha('b') } }), binding)).toBe('other')
    expect(openBinding(openStatus(), { ...binding, acceptance: { ...acceptance, operationId: '77777777-7777-4777-8777-777777777777' } })).toBe('other')
    expect(openBinding(openStatus({ acceptance: { sha256: 'f'.repeat(64), formalBuildId: sha('a') } }), binding)).toBe('other')
    expect(openBinding(openStatus(), { ...binding, acceptance: null })).toBe('other')
  })

  // Prepares a window whose steps before final-open are done; readback (the next step) fails so each run stops there.
  function finalWindow(statusFor: () => Record<string, unknown>, { acceptanceFile = null as Record<string, unknown> | null, finalFailed = false, proofAgeMs = 0 } = {}) {
    const root = privateRoot(), secrets = privateDir(root, 'secrets'), exchange = privateDir(root, 'exchange'), evidence = privateDir(exchange, 'evidence')
    const accounts = (labels: string[]) => ({ accounts: labels.map(label => ({ id: `id-${label}`, username: `user-${label}`, password: `password-${label}` })) })
    const target = writePrivate(join(secrets, 'target.json'), { targetId: 'pre-main', origin: 'https://pre.example.test', directory: '/srv/pre', policyDirectory: '/srv/policy',
      database: { name: 'pre' }, formal: { appOrigin: 'https://app.example.test', apiOrigin: 'https://api.example.test', project: 'formal' } })
    writeFileSync(join(secrets, 'cookie'), '__Host-oa-session=abc\n', { mode: 0o600 })
    const configPath = writePrivate(join(secrets, 'acceptance.json'), { format: 1, targetConfig: target, ssh: 'owner@host', candidate, formalBuild: sha('b'),
      candidateReceipt: writePrivate(join(secrets, 'receipt.json'), { purpose: 'candidate', channel: 'prerelease', sourceSha: candidate, producerSha: sha('d') }),
      accounts: writePrivate(join(secrets, 'accounts.json'), accounts(['A', 'B', 'C'])), teamAccounts: writePrivate(join(secrets, 'team.json'), accounts(['D', 'E'])),
      ownerCookie: join(secrets, 'cookie'), guardConfig: '/srv/guard.json', outputRoot: privateDir(root, 'output') })
    const index = Object.fromEntries(REQUIRED_EVIDENCE.filter(item => item !== 'formal-browser-policy').map(item => [item, { path: `/x/${item}.json`, sha256: 'b'.repeat(64), passed: true }]))
    writePrivate(join(evidence, 'index.json'), index)
    writePrivate(join(exchange, 'formal-browser.json'), { path: '/srv/pre/control/formal-browser.json', sha256: 'c'.repeat(64) })
    if (acceptanceFile) writePrivate(join(exchange, 'acceptance.json'), acceptanceFile)
    const value = { format: 1, windowId: 'c6', generation, formalFrom: sha('a'), formalBuild: sha('b'), previousRun: privateDir(root, 'previous'), run: privateDir(root, 'run'),
      windowDirectory: privateDir(root, 'window'), exchangeDirectory: exchange }
    let state = { ...newState('c6', Date.now()), ops: { reverify: reverifyOp } }
    for (const step of WINDOW_STEPS.slice(0, WINDOW_STEPS.indexOf('final-open'))) state = markStep(markStep(state, step, 'started', Date.now()), step, 'done', Date.now())
    if (proofAgeMs) state = { ...state, steps: { ...state.steps, 'formal-browser': { ...state.steps['formal-browser'], finishedAt: Date.now() - proofAgeMs } } }
    if (finalFailed) state = markStep(markStep(state, 'final-open', 'started', Date.now()), 'final-open', 'failed', Date.now(), { error: 'ssh dropped' })
    writePrivate(join(value.windowDirectory, 'state.json'), state)
    const calls: string[] = []
    const io = {
      setLog: () => {},
      fetch: async (url: string) => ({ status: 200, json: async () => (url.endsWith('/frontend-build.json') ? { gameBuildId: sha('b') } : url.endsWith('/browser-policy') ? { buildId: sha('b') } : { ok: true }) }),
      run(command: string, args: string[]) {
        calls.push([command === process.execPath ? 'node' : command, ...args].join(' '))
        const ok = (value: unknown = '') => ({ status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value) + '\n', stderr: '', error: null })
        if (command === 'git') return ok(args[0] === 'rev-parse' ? 'head\n' : '')
        if (command === 'ssh' && args.at(-1) === '-s') return ok('55555555-5555-4555-8555-555555555555\n')
        if (command === 'ssh' && args.at(-1)!.includes('rev-parse HEAD')) return ok('head\n')
        if (command === './deploy-prerelease.sh') {
          if (args[0] === 'status') return ok(statusFor())
          if (args[0] === 'identities') return ok({ path: '/srv/pre/control/identities.json', identityCount: 3 })
          if (args[0] === 'apply-identities') return ok({ path: '/srv/pre/control/identity-verified.json' })
          if (args[0] === 'open') return ok({ mode: 'open' })
        }
        if (command === process.execPath && args.includes('run')) return { status: 1, stdout: '', stderr: 'readback failed', error: null }
        return ok()
      },
    }
    return { configPath, windowPath: writePrivate(join(root, 'window.json'), value), value, calls, io, exchange }
  }
  const maintenance = () => ({ mode: 'maintenance', fingerprint: 'fp', generation, installed: { buildId: candidate, image: 'sha256:image' },
    operation: { id: reverifyOp, kind: 'reverify', stage: 'acceptance' } })

  it('writes and copies acceptance before the final chain, with no work between audit-complete and activate', async () => {
    const window = finalWindow(maintenance)
    await expect(runWindow({ configPath: window.configPath, windowPath: window.windowPath, resume: true, io: window.io })).rejects.toThrow(/Suite readback did not pass/)
    const at = (text: string) => window.calls.findIndex(call => call.includes(text))
    const audited = at('authority.ts audit-complete'), activated = at('authority.ts activate')
    expect(audited).toBeGreaterThan(-1)
    expect(activated).toBe(audited + 1)
    expect(window.calls.some(call => call.includes('cli.mjs acceptance'))).toBe(false)
    expect(at(join(window.exchange, 'acceptance.json'))).toBeLessThan(at('authority.ts close'))
    expect(window.calls.findIndex(call => call.startsWith('./deploy-prerelease.sh open'))).toBeGreaterThan(activated)
    const written = JSON.parse(readFileSync(join(window.exchange, 'acceptance.json'), 'utf8'))
    expect(written).toMatchObject({ channel: 'prerelease', targetId: 'pre-main', operationId: reverifyOp, buildId: candidate, generation, healthyCycle: '55555555-5555-4555-8555-555555555555' })
    expect(JSON.parse(readFileSync(join(window.value.windowDirectory, 'state.json'), 'utf8')).steps['final-open'].status).toBe('done')
  })

  it('records an open the host already committed under this window instead of replaying the chain', async () => {
    const window = finalWindow(() => ({}), { acceptanceFile: { operationId: reverifyOp, buildId: candidate, generation }, finalFailed: true })
    const local = createHash('sha256').update(readFileSync(join(window.exchange, 'acceptance.json'))).digest('hex')
    window.io.run = ((run) => (command: string, args: string[]) => (command === './deploy-prerelease.sh' && args[0] === 'status'
      ? (window.calls.push(`./deploy-prerelease.sh status`), { status: 0, stdout: JSON.stringify(openStatus({ acceptance: { sha256: local, formalBuildId: sha('b') } })) + '\n', stderr: '', error: null })
      : run(command, args)))(window.io.run)
    await expect(runWindow({ configPath: window.configPath, windowPath: window.windowPath, resume: true, io: window.io })).rejects.toThrow(/Suite readback did not pass/)
    expect(window.calls.some(call => call.includes('authority.ts'))).toBe(false)
    expect(window.calls.some(call => call.startsWith('./deploy-prerelease.sh open'))).toBe(false)
    expect(JSON.parse(readFileSync(join(window.value.windowDirectory, 'state.json'), 'utf8')).steps['final-open'].status).toBe('done')
  })

  it('reconciles an already-committed open before a stale formal proof would be refreshed', async () => {
    const window = finalWindow(() => ({}), { acceptanceFile: { operationId: reverifyOp, buildId: candidate, generation }, finalFailed: true, proofAgeMs: 26 * 60_000 })
    const local = createHash('sha256').update(readFileSync(join(window.exchange, 'acceptance.json'))).digest('hex')
    const run = window.io.run
    window.io.run = (command: string, args: string[]) => (command === './deploy-prerelease.sh' && args[0] === 'status'
      ? (window.calls.push('./deploy-prerelease.sh status'), { status: 0, stdout: JSON.stringify(openStatus({ acceptance: { sha256: local, formalBuildId: sha('b') } })) + '\n', stderr: '', error: null })
      : run(command, args))
    await expect(runWindow({ configPath: window.configPath, windowPath: window.windowPath, resume: true, io: window.io })).rejects.toThrow(/Suite readback did not pass/)
    expect(window.calls.some(call => call.includes('verify-formal-browser'))).toBe(false)
    expect(window.calls.some(call => call.includes('authority.ts'))).toBe(false)
    expect(window.calls.some(call => call.startsWith('./deploy-prerelease.sh open'))).toBe(false)
    expect(window.calls.some(call => call.includes('--suite readback'))).toBe(true)
    const steps = JSON.parse(readFileSync(join(window.value.windowDirectory, 'state.json'), 'utf8')).steps
    expect([steps['formal-browser'].status, steps['copy-evidence'].status, steps['final-open'].status]).toEqual(['done', 'done', 'done'])
  })

  it('stops when pre is already open under another acceptance', async () => {
    const window = finalWindow(() => openStatus(), { acceptanceFile: { operationId: reverifyOp, buildId: candidate, generation }, finalFailed: true })
    await expect(runWindow({ configPath: window.configPath, windowPath: window.windowPath, resume: true, io: window.io })).rejects.toThrow(/already open under a different acceptance/)
    expect(window.calls.some(call => call.includes('authority.ts'))).toBe(false)
  })
})

describe('deletion rows', () => {
  // A window whose next step is deletion-rows; bundle (after owner-notes) fails so a successful collection stops there.
  function deletionWindow(counts: () => { formal: Record<string, Record<string, number>>; pre: string }) {
    const root = privateRoot(), secrets = privateDir(root, 'secrets'), exchange = privateDir(root, 'exchange')
    const accounts = (labels: string[]) => ({ accounts: labels.map(label => ({ id: `id-${label}`, username: `user-${label}`, password: `password-${label}` })) })
    const target = writePrivate(join(secrets, 'target.json'), { targetId: 'pre-main', origin: 'https://pre.example.test', directory: '/srv/pre', policyDirectory: '/srv/policy',
      database: { name: 'pre' }, formal: { appOrigin: 'https://app.example.test', apiOrigin: 'https://api.example.test', project: 'formal' } })
    writeFileSync(join(secrets, 'cookie'), '__Host-oa-session=abc\n', { mode: 0o600 })
    const candidate = sha('c'), generation = '44444444-4444-4444-8444-444444444444'
    const configPath = writePrivate(join(secrets, 'acceptance.json'), { format: 1, targetConfig: target, ssh: 'owner@host', candidate, formalBuild: sha('b'),
      candidateReceipt: writePrivate(join(secrets, 'receipt.json'), { purpose: 'candidate', channel: 'prerelease', sourceSha: candidate, producerSha: sha('d') }),
      accounts: writePrivate(join(secrets, 'accounts.json'), accounts(['A', 'B', 'C'])), teamAccounts: writePrivate(join(secrets, 'team.json'), accounts(['D', 'E'])),
      ownerCookie: join(secrets, 'cookie'), guardConfig: '/srv/guard.json', outputRoot: privateDir(root, 'output') })
    for (const name of ['close', 'associations', 'identity-verified', 'audit', 'activate']) writePrivate(join(exchange, `deletion-${name}.json`), { name })
    const value = { format: 1, windowId: 'c6', generation, formalFrom: sha('a'), formalBuild: sha('b'), previousRun: privateDir(root, 'previous'), run: privateDir(root, 'run'),
      windowDirectory: privateDir(root, 'window'), exchangeDirectory: exchange }
    let state = { ...newState('c6', Date.now()), ops: { reverify: '66666666-6666-4666-8666-666666666666' } }
    for (const step of WINDOW_STEPS.slice(0, WINDOW_STEPS.indexOf('deletion-rows'))) state = markStep(markStep(state, step, 'started', Date.now()), step, 'done', Date.now())
    writePrivate(join(value.windowDirectory, 'state.json'), state)
    const calls: string[] = []
    const io = {
      setLog: () => {},
      fetch: async (url: string) => ({ status: 200, json: async () => (url.endsWith('/frontend-build.json') ? { gameBuildId: sha('b') } : url.endsWith('/browser-policy') ? { buildId: sha('b') } : { ok: true }) }),
      run(command: string, args: string[], { input = '' }: { input?: string } = {}) {
        calls.push([command === process.execPath ? 'node' : command, ...args].join(' '))
        const ok = (stdout = '') => ({ status: 0, stdout, stderr: '', error: null })
        if (command === 'git') return ok(args[0] === 'rev-parse' ? 'head\n' : '')
        if (command === 'ssh' && args.at(-1) === '-s') return ok(input.includes('psql') ? counts().pre : '55555555-5555-4555-8555-555555555555\n')
        if (command === 'ssh' && args.at(-1)!.includes('rev-parse HEAD')) return ok('head\n')
        if (command === 'ssh' && args.at(-1)!.includes('typescript-runtime.mjs')) return ok(JSON.stringify(counts().formal) + '\n')
        if (command === './deploy-prerelease.sh' && args[0] === 'status') return ok(JSON.stringify({ installed: { buildId: candidate }, generation }) + '\n')
        if (command === process.execPath && args.includes('bundle')) return { status: 1, stdout: '', stderr: 'bundle stopped by the test', error: null }
        return ok()
      },
    }
    return { configPath, windowPath: writePrivate(join(root, 'window.json'), value), value, calls, io, exchange }
  }
  const formalZero = { D: { users: 0, beta_access: 0, sessions: 0 }, E: { users: 0, beta_access: 0, sessions: 0 } }

  it('fails the collection on residual rows and collects again on resume once deletion has finished', async () => {
    let pending = true
    const window = deletionWindow(() => pending
      ? { formal: { ...formalZero, E: { users: 1, beta_access: 0, sessions: 2 } }, pre: 'D,0,0,0\nE,0,0,0\n' }
      : { formal: formalZero, pre: 'D,0,0,0\nE,0,0,0\n' })
    await expect(runWindow({ configPath: window.configPath, windowPath: window.windowPath, resume: true, io: window.io }))
      .rejects.toThrow(/still have rows \(E formal\.users=1, E formal\.sessions=2\)/)
    const stateFile = join(window.value.windowDirectory, 'state.json')
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).steps['deletion-rows'].status).toBe('failed')
    expect(JSON.parse(readFileSync(join(window.exchange, 'deletion-rows.json'), 'utf8')).E.formal.users).toBe(1)

    pending = false
    const collections = () => window.calls.filter(call => call.includes('typescript-runtime.mjs')).length
    const before = collections()
    await expect(runWindow({ configPath: window.configPath, windowPath: window.windowPath, resume: true, io: window.io })).rejects.toThrow(/bundle failed/)
    expect(collections()).toBe(before + 1)
    const steps = JSON.parse(readFileSync(stateFile, 'utf8')).steps
    expect([steps['deletion-rows'].status, steps['owner-notes'].status, steps.bundle.status]).toEqual(['done', 'done', 'failed'])
    expect(JSON.parse(readFileSync(join(window.exchange, 'owner-notes.json'), 'utf8'))['deletion-audit'].remainingRows.E.formal).toEqual({ users: 0, beta_access: 0, sessions: 0 })
  })

  it('treats a missing formal or pre count as incomplete, not as zero', () => {
    expect(() => assertNoResidualRows({ D: zeroRows })).toThrow(/for E are missing/)
    expect(() => assertNoResidualRows({ D: zeroRows, E: { pre: zeroRows.pre } })).toThrow(/for E are missing/)
    expect(() => assertNoResidualRows({ D: zeroRows, E: zeroRows })).not.toThrow()
  })
})
