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

it('executes nested original cases and rejects a candidate changed after assembly', () => {
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
  const cli = (command: string) => spawnSync(process.execPath, ['scripts/audit-migration.mjs', command, '--manifest', path.join(checkout, 'cases.json'), '--output', output], { cwd: checkout, encoding: 'utf8' })
  const prepared = cli('prepare')
  expect(prepared.status, prepared.stderr).toBe(0)
  const verified = cli('verify')
  expect(verified.status, `${verified.stderr}\n${verified.stdout}`).toBe(0)
  expect(JSON.parse(verified.stdout)).toMatchObject({ passed: 1, pending: 0, coveredSourceCases: 1, missingTypeRoots: [], includedTypeRoots: 1 })
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
