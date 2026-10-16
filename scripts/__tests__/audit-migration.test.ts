import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))
const run = (manifest: unknown) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-migration-cli-'))
  roots.push(root)
  const file = path.join(root, 'cases.json')
  fs.writeFileSync(file, JSON.stringify(manifest))
  return spawnSync(process.execPath, ['scripts/audit-migration.mjs', 'check', '--manifest', file], { encoding: 'utf8' })
}
const manifest = (cases: unknown[]) => ({ version: 1, source: { commit: 'fafd4f51b02357855d6895e173a521256ea6741e', files: 1, cases: cases.length }, files: [{ file: 'ae-negative-example.test.ts', sha256: 'a'.repeat(64), cases }] })

it('validates remaining cases without requiring the local audit branch', () => {
  const result = run(manifest([{ title: 'card N1 rejects invalid payment', batch: 'M01', status: 'remaining' }]))
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ sourceCases: 1, remaining: 1, resolved: 0 })
})
it('rejects a migrated case with no native target instead of dropping coverage', () => {
  const result = run(manifest([{ title: 'card N1 rejects invalid payment', batch: 'M01', status: 'migrated' }]))
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('requires targetFile and targetTitle')
})
it('rejects duplicate dynamic identities and unexplained deduplication', () => {
  const one = { title: 'card N1 rejects invalid payment', batch: 'M01', status: 'remaining' }
  const duplicate = run(manifest([one, one]))
  expect(duplicate.status).toBe(1)
  expect(duplicate.stderr).toContain('duplicate dynamic identity')
  const deduplicated = run(manifest([{ ...one, status: 'existing-coverage', targetFile: 'server/__tests__/A001-session.test.ts', targetTitle: 'rejects invalid payment' }]))
  expect(deduplicated.status).toBe(1)
  expect(deduplicated.stderr).toContain('requires rationale')
})

it('checks the checked-in migration inventory in the ordinary fast suite', () => {
  const result = spawnSync(process.execPath, ['scripts/audit-migration.mjs', 'check'], { encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ sourceFiles: 279, sourceCases: 3252 })
})

it('requires an explicit deduplication explanation when native targets are shared', () => {
  const target = { batch: 'M01', status: 'migrated', targetFile: 'server/__tests__/B026_AgrarianFences-quota-session.test.ts', targetTitle: 'rejects invalid payment and retries' }
  const first = { ...target, title: 'card N1 rejects invalid payment' }
  const second = { ...target, title: 'card N2 allows valid retry' }
  const duplicate = run(manifest([first, second]))
  expect(duplicate.status).toBe(1)
  expect(duplicate.stderr).toContain('duplicate native target requires existing-coverage and rationale')
  const explained = run(manifest([first, { ...second, status: 'existing-coverage', rationale: 'The same native scenario asserts rejection before the successful retry.' }]))
  expect(explained.status, explained.stderr).toBe(0)
})

const createFixture = () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-overlay-cli-'))
  roots.push(temporary)
  const checkout = path.join(temporary, 'checkout')
  const output = path.join(temporary, 'run')
  const write = (file: string, text: string) => {
    const target = path.join(checkout, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
  }
  write('scripts/audit-migration.mjs', fs.readFileSync('scripts/audit-migration.mjs', 'utf8'))
  write('package.json', '{"type":"module"}')
  write('vitest.config.ts', "import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ extends: true, test: { name: 'fast-server', include: ['server/__tests__/*.test.ts'] } }] } })\n")
  write('.gitignore', 'node_modules/\n')
  write('tsconfig.server.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true, types: ['node'] } }))
  write('shared/cards/__tests__/setup-register-all.ts', 'export {}')
  write('shared/cards/__tests__/setup-listener-purity.ts', 'export {}')
  write('server/__tests__/_helpers/negative-rule-audit.ts', 'export {}')
  const source = "import { describe, it, expect } from 'vitest'\ndescribe('grain rules', () => { it('N1 rejects excess payment', () => { expect(3).toBe(3) }) })\n"
  write('server/__tests__/ae-negative-example.test.ts', source)
  fs.symlinkSync(path.resolve('node_modules'), path.join(checkout, 'node_modules'), 'dir')
  const git = (...arguments_: string[]) => {
    const result = spawnSync('git', arguments_, { cwd: checkout, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  git('init', '--quiet')
  git('add', '.')
  git('-c', 'user.name=Migration test', '-c', 'user.email=migration@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'test fixture')
  const fixtureManifest = manifest([{ title: 'grain rules N1 rejects excess payment', ancestors: ['grain rules'], batch: 'M01', status: 'remaining' }])
  fixtureManifest.source.commit = git('rev-parse', 'HEAD')
  fixtureManifest.files[0].sha256 = createHash('sha256').update(source).digest('hex')
  write('cases.json', JSON.stringify(fixtureManifest))
  const cli = (command: string, runOutput = output) => spawnSync(process.execPath, ['scripts/audit-migration.mjs', command, '--manifest', path.join(checkout, 'cases.json'), '--output', runOutput], { cwd: checkout, encoding: 'utf8' })
  return { checkout, output, write, git, cli, fixtureManifest }
}

it.each([
  { caller: 'unset', actual: 0, expectedExit: 1 },
  { caller: '0', actual: 0, expectedExit: 1 },
  { caller: 'unset', actual: 1, expectedExit: 0 },
  { caller: '0', actual: 1, expectedExit: 0 },
])('uses the strict expected oracle with caller RAW=$caller and actual=$actual', ({ caller, actual, expectedExit }) => {
  const { checkout, output, write, git, cli, fixtureManifest } = createFixture()
  write('server/__tests__/_helpers/negative-rule-audit.ts', `import assert from 'node:assert/strict'
export function assertRuleOutcome<T>(actual: T, expected: T, known?: { id: string; observed: T }): void {
  if (!known || process.env.AGRICOLA_NEGATIVE_RAW === '1') {
    assert.deepEqual(actual, expected, known?.id)
    return
  }
  assert.deepEqual(actual, known.observed, known.id + ': observed failure changed; reclassify')
  assert.notDeepEqual(actual, expected, known.id + ': rule now passes; remove expected failure')
}
`)
  const source = `import { describe, it } from 'vitest'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
describe('grain rules', () => {
  it('N1 rejects excess payment', () => assertRuleOutcome(${actual}, 1, { id: 'known-rule-gap', observed: 0 }))
})
`
  write('server/__tests__/ae-negative-example.test.ts', source)
  git('add', 'server/__tests__/ae-negative-example.test.ts', 'server/__tests__/_helpers/negative-rule-audit.ts')
  git('-c', 'user.name=Migration test', '-c', 'user.email=migration@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'known observed rule fixture')
  fixtureManifest.source.commit = git('rev-parse', 'HEAD')
  fixtureManifest.files[0].sha256 = createHash('sha256').update(source).digest('hex')
  write('cases.json', JSON.stringify(fixtureManifest))
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  const environment = { ...process.env }
  if (caller === 'unset') delete environment.AGRICOLA_NEGATIVE_RAW
  else environment.AGRICOLA_NEGATIVE_RAW = caller
  const verified = spawnSync(process.execPath, ['scripts/audit-migration.mjs', 'verify', '--manifest', path.join(checkout, 'cases.json'), '--output', output], { cwd: checkout, encoding: 'utf8', env: environment })
  expect(verified.status, `${verified.stderr}\n${verified.stdout}`).toBe(expectedExit)
  const summary = JSON.parse(verified.stdout)
  expect(summary).toMatchObject({ rawMode: 'strict-expected', typesExit: 0, fileInventoryExit: 0, tests: 1, passed: expectedExit === 0 ? 1 : 0, failed: expectedExit, coveredSourceCases: expectedExit === 0 ? 1 : 0, unresolvedSourceCases: expectedExit })
  expect(JSON.parse(fs.readFileSync(path.join(output, 'summary.json'), 'utf8'))).toEqual(summary)
  const behavior = JSON.parse(fs.readFileSync(path.join(output, 'behavior.json'), 'utf8'))
  expect(behavior.testResults[0].assertionResults[0].status).toBe(expectedExit === 0 ? 'passed' : 'failed')
  if (expectedExit === 1) expect(behavior.testResults[0].assertionResults[0].failureMessages.join('\n')).toContain('known-rule-gap')
}, 30000)

it('rejects an external-looking output whose existing ancestor links into Git', () => {
  const { checkout, output, cli } = createFixture()
  const link = path.join(path.dirname(output), 'checkout-link')
  fs.symlinkSync(checkout, link, 'dir')
  const result = cli('prepare', path.join(link, 'nested', 'run'))
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('overlay and evidence must be outside Git')
  expect(fs.existsSync(path.join(checkout, 'nested'))).toBe(false)
})

it.each(['working-tree', 'HEAD'])('rejects a sealed run after the live checkout changes: %s', change => {
  const { write, git, cli } = createFixture()
  write('server/rules.ts', 'export const payment = 1')
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  if (change === 'working-tree') write('server/rules.ts', 'export const payment = 2')
  else git('-c', 'user.name=Migration test', '-c', 'user.email=migration@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '--allow-empty', '-m', 'new candidate HEAD')
  const verified = cli('verify')
  expect(verified.status).toBe(1)
  expect(verified.stderr).toContain('live checkout changed since assembly')
}, 30000)

it.each(['text fixture', 'ignored SQL fixture', 'symbolic link'])('rejects a new candidate input outside code/JSON: %s', addition => {
  const { output, write, cli } = createFixture()
  write('.gitignore', 'node_modules/\n*.sql\n')
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  const candidate = path.join(output, 'candidate')
  if (addition === 'symbolic link') fs.symlinkSync('package.json', path.join(candidate, 'fixture-link.txt'))
  else fs.writeFileSync(path.join(candidate, addition === 'text fixture' ? 'payment.txt' : 'payment.sql'), 'payment changes the rule result')
  const verified = cli('verify')
  expect(verified.status).toBe(1)
  expect(verified.stderr).toContain('candidate source inventory changed since assembly')
}, 30000)

it('runs native destinations with their owning projects and isolation', () => {
  const { output, write, cli, fixtureManifest } = createFixture()
  const executionLog = path.join(path.dirname(output), 'execution.log')
  write('vitest.config.ts', `import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { maxWorkers: 1, fileParallelism: false, projects: [
  { extends: true, test: { name: 'fast-server', include: ['server/__tests__/fast-*.test.ts'], setupFiles: ['./fast-setup.ts'] } },
  { extends: true, test: { name: 'slow', include: ['server/__tests__/slow-*.test.ts'], setupFiles: ['./slow-setup.ts'], isolate: false } },
] } })`)
  write('fast-setup.ts', "process.env.NATIVE_OWNER = 'fast-server'")
  write('slow-setup.ts', "process.env.NATIVE_OWNER = 'slow'")
  write('server/__tests__/visits.ts', 'export const visits: string[] = []')
  const destinations = ['fast-one', 'fast-two', 'slow-one', 'slow-two']
  fixtureManifest.files[0].cases = destinations.map(name => {
    const targetFile = `server/__tests__/${name}.test.ts`
    const owner = name.startsWith('fast') ? 'fast-server' : 'slow'
    write(targetFile, `import fs from 'node:fs'
import { it, expect } from 'vitest'
import { visits } from './visits'
it('${name}', () => {
  expect(process.env.NATIVE_OWNER).toBe('${owner}')
  visits.push('${name}')
  fs.appendFileSync(${JSON.stringify(executionLog)}, '${owner}:' + visits.length + '\\n')
})`)
    return { title: `original ${name}`, batch: 'M01', status: 'migrated', targetFile, targetTitle: name }
  })
  fixtureManifest.source.cases = destinations.length
  write('cases.json', JSON.stringify(fixtureManifest))
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  const verified = cli('verify')
  expect(verified.status, `${verified.stderr}\n${verified.stdout}`).toBe(0)
  expect(JSON.parse(verified.stdout)).toMatchObject({ passed: 4, coveredSourceCases: 4, includedTypeRoots: 4 })
  expect(fs.readFileSync(executionLog, 'utf8').trim().split('\n').sort()).toEqual(['fast-server:1', 'fast-server:1', 'slow:1', 'slow:2'])
}, 30000)

it('executes nested original cases and rejects a candidate changed after assembly', () => {
  const { checkout, output, cli } = createFixture()
  const internalOutput = path.join(checkout, '..artifacts')
  const internal = cli('prepare', internalOutput)
  expect.soft(internal.status).toBe(1)
  expect.soft(internal.stderr).toContain('overlay and evidence must be outside Git')
  fs.rmSync(internalOutput, { recursive: true, force: true })
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  const verified = cli('verify')
  expect(verified.status, `${verified.stderr}\n${verified.stdout}`).toBe(0)
  expect(JSON.parse(verified.stdout)).toMatchObject({ passed: 1, pending: 0, coveredSourceCases: 1, missingTypeRoots: [], includedTypeRoots: 1 })
  const sealedManifest = path.join(output, 'cases.json')
  const originalManifest = fs.readFileSync(sealedManifest, 'utf8')
  const missingCase = JSON.parse(originalManifest)
  missingCase.source.cases = 0
  missingCase.files[0].cases = []
  fs.writeFileSync(sealedManifest, JSON.stringify(missingCase))
  const changedManifest = cli('verify')
  expect.soft(changedManifest.status).toBe(1)
  expect.soft(changedManifest.stderr).toContain('run manifest changed since assembly')
  fs.writeFileSync(sealedManifest, originalManifest)
  const addedSource = path.join(output, 'candidate/server/auto-discovered.ts')
  fs.writeFileSync(addedSource, 'export const changedRule = true')
  const added = cli('verify')
  expect(added.status).toBe(1)
  expect(added.stderr).toContain('candidate source inventory changed since assembly')
  fs.unlinkSync(addedSource)
  fs.appendFileSync(path.join(output, 'candidate/server/__tests__/ae-negative-example.test.ts'), '\nthrow new Error("source changed")\n')
  const changed = cli('verify')
  expect(changed.status).toBe(1)
  expect(changed.stderr).toContain('candidate changed since assembly')
}, 30000)

it('checks native targets and their helpers without reading the original audit commit', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'native-test-gate-'))
  roots.push(temporary)
  const checkout = path.join(temporary, 'checkout')
  const write = (file: string, contents: string) => {
    const target = path.join(checkout, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }
  write('scripts/audit-migration.mjs', fs.readFileSync('scripts/audit-migration.mjs', 'utf8'))
  write('.gitignore', 'node_modules/\n')
  write('package.json', '{"type":"module"}')
  write('tsconfig.server.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true, types: ['node'] } }))
  write('server/__tests__/native-example.test.ts', "import { it, expect } from 'vitest'\nimport { payment } from './_helpers/payment'\nit('rejects excess payment', () => expect(payment).toBe(1))\n")
  write('server/__tests__/_helpers/payment.ts', 'export const payment: number = 1\n')
  const nativeManifest = manifest([{ title: 'card N1 rejects excess payment', batch: 'M01', status: 'migrated', targetFile: 'server/__tests__/native-example.test.ts', targetTitle: 'rejects excess payment' }])
  write('cases.json', JSON.stringify(nativeManifest))
  fs.symlinkSync(path.resolve('node_modules'), path.join(checkout, 'node_modules'), 'dir')
  expect(spawnSync('git', ['init', '--quiet'], { cwd: checkout }).status).toBe(0)
  const gate = () => spawnSync(process.execPath, ['scripts/audit-migration.mjs', 'check-native', '--manifest', path.join(checkout, 'cases.json')], { cwd: checkout, encoding: 'utf8' })
  const passed = gate()
  expect(passed.status, passed.stderr).toBe(0)
  expect(JSON.parse(passed.stdout)).toMatchObject({ nativeFiles: ['server/__tests__/native-example.test.ts'], missingTypeRoots: [], typesExit: 0 })
  write('server/__tests__/_helpers/payment.ts', "export const payment: number = 'invalid'\n")
  const failed = gate()
  expect(failed.status).toBe(1)
  expect(`${failed.stdout}\n${failed.stderr}`).toContain('TS2322')
  write('server/__tests__/_helpers/payment.ts', 'export const payment: number = 1\n')
  write('docs/test/ae-negative-audit/evidence/snapshot.json', '{}')
  const artifact = gate()
  expect(artifact.status).toBe(1)
  expect(artifact.stderr).toContain('Keep scenario evidence outside Git')
}, 30000)

it('physically removes migrated registrations from a partial source group', () => {
  const { output, write, git, cli, fixtureManifest } = createFixture()
  const source = "import { it, expect } from 'vitest'\nfunction movedPayment() { return 2 }\nit('moved payment', () => expect(movedPayment()).toBe(2))\nit('remaining payment', () => expect(3).toBe(3))\n"
  write('server/__tests__/ae-negative-example.test.ts', source)
  write('server/__tests__/native-payment.test.ts', "import { it, expect } from 'vitest'\nit('native payment', () => expect(2).toBe(2))\n")
  git('add', '.')
  git('-c', 'user.name=Migration test', '-c', 'user.email=migration@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'partial source fixture')
  fixtureManifest.source.commit = git('rev-parse', 'HEAD')
  fixtureManifest.source.cases = 2
  fixtureManifest.files[0].sha256 = createHash('sha256').update(source).digest('hex')
  fixtureManifest.files[0].cases = [
    { title: 'moved payment', batch: 'M01', status: 'migrated', targetFile: 'server/__tests__/native-payment.test.ts', targetTitle: 'native payment' },
    { title: 'remaining payment', batch: 'M01', status: 'remaining' },
  ]
  write('cases.json', JSON.stringify(fixtureManifest))
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  const candidate = fs.readFileSync(path.join(output, 'candidate/server/__tests__/ae-negative-example.test.ts'), 'utf8')
  expect(candidate).not.toContain('moved payment')
  expect(candidate).not.toContain('function movedPayment')
  expect(candidate).toContain('remaining payment')
  const verified = cli('verify')
  expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0)
  expect(JSON.parse(verified.stdout)).toMatchObject({ tests: 2, passed: 2, pending: 0, coveredSourceCases: 2 })
}, 30000)

it('fails closed instead of partially pruning dynamic registrations', () => {
  const { write, git, cli, fixtureManifest } = createFixture()
  const source = "import { it, expect } from 'vitest'\nconst title = 'moved payment'\nit(title, () => expect(2).toBe(2))\nit('remaining payment', () => expect(3).toBe(3))\n"
  write('server/__tests__/ae-negative-example.test.ts', source)
  write('server/__tests__/native-payment.test.ts', "import { it, expect } from 'vitest'\nit('native payment', () => expect(2).toBe(2))\n")
  git('add', '.')
  git('-c', 'user.name=Migration test', '-c', 'user.email=migration@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'dynamic source fixture')
  fixtureManifest.source.commit = git('rev-parse', 'HEAD')
  fixtureManifest.source.cases = 2
  fixtureManifest.files[0].sha256 = createHash('sha256').update(source).digest('hex')
  fixtureManifest.files[0].cases = [
    { title: 'moved payment', batch: 'M01', status: 'migrated', targetFile: 'server/__tests__/native-payment.test.ts', targetTitle: 'native payment' },
    { title: 'remaining payment', batch: 'M01', status: 'remaining' },
  ]
  write('cases.json', JSON.stringify(fixtureManifest))
  const prepared = cli('prepare')
  expect(prepared.status).toBe(1)
  expect(prepared.stderr).toContain('unsupported partial registration')
})
