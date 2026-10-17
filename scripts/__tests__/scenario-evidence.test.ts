import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })))
const root = path.resolve(__dirname, '../..')
const helper = path.join(root, 'server/__tests__/_helpers/scenario-evidence.ts')
const fixture = path.join(root, 'server/__tests__/_helpers/session-fixtures.ts')
const sessionImports = `import { createWorkSession } from ${JSON.stringify(fixture)}\nimport { createScenarioEvidence } from ${JSON.stringify(helper)}\n`

function run(source: string | string[], { diagnostic = false, blockOutput = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-scenario-evidence-'))
  temporary.push(directory)
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  const sources = typeof source === 'string' ? [source] : source
  sources.forEach((text, index) => fs.writeFileSync(path.join(directory, `scenario-${index}.test.ts`), `${sessionImports}${text}`))
  fs.writeFileSync(path.join(directory, 'vitest.config.mjs'), `export default ${JSON.stringify({ test: { root: directory, include: ['scenario*.test.ts'], pool: 'forks', maxWorkers: 2 } })}`)
  const output = path.join(directory, 'evidence')
  if (blockOutput) fs.writeFileSync(output, 'blocked')
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', path.join(directory, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${path.join(directory, 'results.json')}`], {
    cwd: directory, encoding: 'utf8', env: { ...process.env, AGRICOLA_TEST_EVIDENCE_DIR: output, AGRICOLA_TEST_DIAGNOSTIC: diagnostic ? '1' : '0' },
  })
  return { ...result, directory, output }
}

function evidenceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? evidenceFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
}

it('successful Session tests keep full state off disk', () => {
  const result = run(`import { describe, it, expect } from 'vitest'
describe('successful scenario', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('observes the real two-player fixture', () => {
    const session = evidence.track(createWorkSession())
    expect(session.getState().state.players).toHaveLength(2)
  })
})`)
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(evidenceFiles(result.output)).toEqual([])
}, 30000)

it('captures a failure before any save while the Session rules are still live', () => {
  const result = run(`import fs from 'node:fs'
import { describe, it, expect, onTestFailed } from 'vitest'
describe('failing scenario', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('fails before a checkpoint call', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    onTestFailed(() => fs.writeFileSync('after-cleanup.json', JSON.stringify({ forest: session.getState().actionAvailability.forest })))
    expect(session.getState().actionAvailability.forest, 'original body failure').toBe(true)
  })
})`)
  expect(result.status).toBe(1)
  const files = evidenceFiles(result.output)
  expect(files).toHaveLength(1)
  const saved: unknown = JSON.parse(fs.readFileSync(files[0]!, 'utf8'))
  expect(saved).toMatchObject({ scenario: 'fails before a checkpoint call', sessions: [{ response: { actionAvailability: { forest: false } } }] })
  expect(JSON.parse(fs.readFileSync(path.join(result.directory, 'after-cleanup.json'), 'utf8'))).toEqual({ forest: true })
  expect(fs.readFileSync(path.join(result.directory, 'results.json'), 'utf8')).toContain('original body failure')
}, 30000)

it('diagnostic checkpoints freeze state at the record call', () => {
  const result = run(`import { describe, it, expect } from 'vitest'
describe('diagnostic scenario', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('records before grain is taken', () => {
    const session = evidence.track(createWorkSession({ configure(state) { state.players[0].resources.grain = 0 } }))
    evidence.record('before grain', session.getState())
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok).toBe(true)
    expect(response.state.players[0].resources.grain).toBe(1)
  })
})`, { diagnostic: true })
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  const files = evidenceFiles(result.output)
  expect(files).toHaveLength(1)
  const saved: unknown = JSON.parse(fs.readFileSync(files[0]!, 'utf8'))
  expect(saved).toMatchObject({ records: [{ label: 'before grain', value: { state: { players: [{ resources: { grain: 0 } }, {}] } } }], sessions: [{ response: { state: { players: [{ resources: { grain: 1 } }, {}] } } }] })
}, 30000)

it('a later teardown failure retains its pre-dispose checkpoint', () => {
  const result = run(`import { afterEach, describe, it, expect } from 'vitest'
describe('late failure', () => {
  afterEach(() => { throw new Error('original later teardown failure') })
  const evidence = createScenarioEvidence(import.meta.url)
  it('passes its body before teardown fails', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    expect(session.getState().actionAvailability.forest).toBe(false)
  })
})`)
  expect(result.status).toBe(1)
  const files = evidenceFiles(result.output)
  expect(files).toHaveLength(1)
  const saved: unknown = JSON.parse(fs.readFileSync(files[0]!, 'utf8'))
  expect(saved).toMatchObject({ sessions: [{ response: { actionAvailability: { forest: false } } }] })
  expect(fs.readFileSync(path.join(result.directory, 'results.json'), 'utf8')).toContain('original later teardown failure')
}, 30000)

it('parallel files with identical scenario names retain separate diagnostic evidence', () => {
  const source = `import { describe, it, expect } from 'vitest'
describe('parallel scenarios', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('相同场景 / shared label', () => {
    const session = evidence.track(createWorkSession())
    expect(session.getState().state.players).toHaveLength(2)
  })
})`
  const result = run([source, source], { diagnostic: true })
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  const files = evidenceFiles(result.output)
  expect(files).toHaveLength(2)
  expect(new Set(files).size).toBe(2)
  for (const file of files) {
    const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(saved).toMatchObject({ scenario: '相同场景 / shared label', sessions: [{ response: { ok: true } }] })
  }
}, 30000)

it('an evidence write failure preserves the original failure and still disposes sessions', () => {
  const result = run(`import fs from 'node:fs'
import { describe, it, expect, onTestFailed } from 'vitest'
describe('unwritable evidence', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('keeps the body failure', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    onTestFailed(() => fs.writeFileSync('after-cleanup.json', JSON.stringify({ forest: session.getState().actionAvailability.forest })))
    expect(session.getState().actionAvailability.forest, 'original unwritable body failure').toBe(true)
  })
})`, { blockOutput: true })
  expect(result.status).toBe(1)
  expect(fs.readFileSync(result.output, 'utf8')).toBe('blocked')
  expect(result.stderr).toContain('scenario-evidence-error')
  expect(fs.readFileSync(path.join(result.directory, 'results.json'), 'utf8')).toContain('original unwritable body failure')
  expect(JSON.parse(fs.readFileSync(path.join(result.directory, 'after-cleanup.json'), 'utf8'))).toEqual({ forest: true })
}, 30000)

it('keeps the checkpoint until a later onTestFinished failure is known', () => {
  const result = run(`import { describe, it, expect, onTestFinished } from 'vitest'
describe('finished hook failure', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('passes before its final callback fails', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    onTestFinished(() => { throw new Error('original finished callback failure') })
    expect(session.getState().actionAvailability.forest).toBe(false)
  })
})`)
  expect(result.status).toBe(1)
  const files = evidenceFiles(result.output)
  expect(files).toHaveLength(1)
  const saved: unknown = JSON.parse(fs.readFileSync(files[0]!, 'utf8'))
  expect(saved).toMatchObject({ sessions: [{ response: { actionAvailability: { forest: false } } }] })
  expect(fs.readFileSync(path.join(result.directory, 'results.json'), 'utf8')).toContain('original finished callback failure')
}, 30000)

it('counts omitted oversized records and keeps the retained checkpoint bounded', () => {
  const result = run(`import { describe, it, expect } from 'vitest'
describe('bounded evidence', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('reports an oversized record', () => {
    const session = evidence.track(createWorkSession())
    evidence.record('oversized input', 'x'.repeat(2 * 1024 * 1024))
    expect(session.getState().ok).toBe(true)
  })
})`, { diagnostic: true })
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  const files = evidenceFiles(result.output)
  expect(files).toHaveLength(1)
  const file = files[0]!
  const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  expect(saved).toMatchObject({ records: [], omittedRecords: 1, sessions: [{ response: { ok: true } }] })
  expect(fs.statSync(file).size).toBeLessThan(4 * 1024 * 1024)
}, 30000)
