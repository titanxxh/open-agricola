import { expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writePrivateJson } from '../prerelease/live-acceptance/window.mjs'
import { runSourceUpdate, selectAttempt } from '../prerelease/source-update.mjs'
import { sourceSmokeCase } from '../prerelease/live-acceptance/suites.mjs'

const from = 'a'.repeat(40), to = 'b'.repeat(40), producer = 'c'.repeat(40)
const generation = '00000000-0000-4000-8000-000000000001', room = '00000000-0000-4000-8000-000000000002'
const status = { mode: 'open', operation: null, installed: {buildId: from, runtimeDigest: 'sha256:' + 'd'.repeat(64)}, generation }
const fresh = { active: null, requested: null, latest: () => to, status, producer, fingerprint: 'pre-A' }

it('pins the prerelease head once and resumes the same installation through an interrupted cutover', () => {
  const active = selectAttempt(fresh)
  expect(active).toMatchObject({from, to, generation, bootstrap: false})
  const resume = {...fresh, active, latest: () => { throw Error('branch advanced') }, status: { mode: 'maintenance' }}
  expect(selectAttempt(resume)).toEqual(active)
  for (const different of [{requested: from}, {producer: to}, {fingerprint: 'other'}]) expect(() => selectAttempt({...resume, ...different})).toThrow(/unfinished/)
})

it('returns a no-op for an open current source and requires bootstrap verification when replacing an image', () => {
  expect(selectAttempt({...fresh, requested: from})).toBeNull()
  expect(selectAttempt({...fresh, status: {...status, installed: {buildId: from}}})).toMatchObject({bootstrap: true})
  expect(() => selectAttempt({...fresh, status: {...status, operation: {stage:'migration'}}})).toThrow(/pending/)
})

it('requires the installed frontend and backend and a second participant join and snapshot for the same room', async () => {
  const states: {roomId: string, sync: string, version: number, payload: {state: object}}[] = [], joins: {roomId: string, status: string, playerIndex: number}[] = []
  const connect = () => { states.push({roomId: room, sync:'snapshot', version:7, payload:{state:{}}}); joins.push({roomId:room, status:'playing', playerIndex:0}) }
  const descriptor = {gameBuildId:to, releaseChannel:'prerelease'}
  const page = {evaluate: vi.fn(async () => [descriptor, {buildId:to}]), goto: vi.fn(async () => connect()), reload: vi.fn(async () => connect())}
  const close = vi.fn()
  const kit = {origins:{pre:'https://pre.invalid'}, binding:{build:to, generation}, gameContext: async () => ({context:{newPage:async () => page,close}}),
    enterPre:vi.fn(), preFetch:async () => ({status:200,user:'A'}), observeGameSocket: () => ({states, joins, latest: () => states.at(-1)})}
  const run = () => sourceSmokeCase(kit, {}, [{label:'A'}], room)
  await expect(run()).resolves.toMatchObject({case:'source-smoke',buildId:to,backendBuildId:to,roomId:room,version:7,passed:true})
  expect(page.goto).toHaveBeenCalledWith('https://pre.invalid/open-agricola/?room=' + room)
  expect(page.reload).toHaveBeenCalledTimes(1)
  page.evaluate.mockResolvedValueOnce([descriptor, {buildId: from}])
  await expect(run()).rejects.toThrow()
  expect(close).toHaveBeenCalledTimes(2)
})

it('drives a failed first transfer and a successful retry with the same proof, immutable target and private acceptance files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oa-update-test-'))
  const file = (name: string, value: unknown) => { const path = join(dir, name); writePrivateJson(path, value); return path }
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
  const participant = {id:'participant', username:'pre-player', password:'fixture'}
  try {
    const targetConfig = file('target.json', read('deploy/prerelease-target.example.json'))
    const template = file('template.json', {format:1, ssh:'prehost', targetConfig,
      accounts: file('full-accounts.json', {accounts: ['a','b','c'].map(id => ({...participant, id}))}), candidateReceipt:'legacy.json'})
    const config = {stateDirectory:dir, acceptanceConfig:template, exchangeRoot:join(dir,'exchange'), acceptanceRoom:room,
      routineAccounts:file('participant.json',{accounts:[participant]})}
    const latest = vi.fn(() => to), authorize = vi.fn(), transfer = vi.fn()
    const command = (program: string, args: string[]) => {
      if (program === 'git') return args[0] === 'status' ? '' : producer
      if (program === './deploy-prerelease.sh' && args[0] === 'status') return JSON.stringify(status)
      if (program === './deploy-prerelease.sh' && args[0] === 'authorize-source') {
        authorize()
        const path = args[args.indexOf('--output') + 1]
        writePrivateJson(path, {kind:'prerelease-source',scope:'routine',sha:to,from,producer,runId:1,attempt:1})
        return '{}'
      }
      if (args.includes('scripts/prerelease/source-runtime-transfer.ts')) {
        transfer()
        if (transfer.mock.calls.length === 1) throw Error('transfer interrupted')
        return ''
      }
      throw Error('unexpected external action')
    }
    const performWindow = vi.fn(async ({configPath, windowPath}: {configPath:string, windowPath:string}) => {
      const win = read(windowPath), acceptance = read(configPath)
      expect(win.install).toEqual({from,to,sourceProof:acceptance.sourceProof})
      expect(acceptance.accounts).toBe(config.routineAccounts)
      expect(acceptance.candidateReceipt).toBeUndefined()
      expect(win.acceptanceRoom).toBe(room)
      mkdirSync(win.exchangeDirectory,{mode:0o700,recursive:true})
      writePrivateJson(join(win.exchangeDirectory,'source-closed.json'), {closedAt:1000})
      writePrivateJson(join(win.windowDirectory,'state.json'), {steps:{'final-open':{finishedAt:7500}}})
    })
    const services = {command, candidateSha:vi.fn(), commitRef:latest, liveFormalBuild:async () => ({healthy:true,policy:producer,pages:producer}), runWindow:performWindow}
    await expect(runSourceUpdate(config,{},services)).rejects.toThrow('transfer interrupted')
    const pending = read(join(dir,'active.json'))
    await expect(runSourceUpdate(config,{},services)).resolves.toMatchObject({result:'open',buildId:to,attempt:join(dir,pending.id),closeToOpenMs:6500})
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(latest).toHaveBeenCalledTimes(1)
    expect(performWindow).toHaveBeenCalledTimes(1)
    expect(existsSync(join(dir,'active.json'))).toBe(false)
    expect(read(join(dir,pending.id,'outcome.json')).result).toBe('open')
  } finally { rmSync(dir,{force:true,recursive:true}) }
})
