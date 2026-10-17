import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { localProof } from '../audit-migration/local-proof.mjs'
import { assertCommittedSource } from '../audit-migration/committed-source.mjs'
import { runValidation } from '../audit-migration/run.mjs'

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  directories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true }))
})
const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex')
const json = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value))

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-committed-source-'))
  directories.push(directory)
  const worktree = path.join(directory, 'repo')
  const raw = path.join(directory, 'raw')
  const bin = path.join(directory, 'bin')
  for (const file of [worktree, raw, bin]) fs.mkdirSync(file)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8' }).trim()
  git('init', '--quiet')
  fs.writeFileSync(path.join(worktree, '.gitignore'), 'output/\n')
  fs.writeFileSync(path.join(worktree, 'native.test.ts'), 'export const value = "committed source"\n')
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'fixture')
  const head = git('rev-parse', 'HEAD')
  const prepush = path.join(directory, 'prepush.json')
  const sealProof = () => {
    const pre = { mode: 'prepush', head, fingerprint: 'actual-working-tree-fingerprint', status: 'passed', steps: ['test-services', 'fast', 'lint'].map(name => ({ name, status: 'passed', exitCode: 0 })) }
    fs.mkdirSync(path.join(worktree, 'output/verification'), { recursive: true })
    json(prepush, pre)
    json(path.join(worktree, 'output/verification/prepush.json'), pre)
    const files = git('ls-files', '-z').split('\0').filter(Boolean).map(file => [file, hash(fs.readFileSync(path.join(worktree, file)))])
    json(path.join(raw, 'assembly.json'), { candidateCommit: head, candidateFiles: files, candidateFingerprint: hash(JSON.stringify(files)) })
    json(path.join(raw, 'summary.json'), { rawMode: 'strict-expected', typesExit: 0, fileInventoryExit: 0, behaviorExit: 0, failed: 0, pending: 0, todo: 0, unresolvedSourceCases: 0, missingTypeRoots: [], includedTypeRoots: 1, coveredSourceCases: 3252, tests: 1, passed: 1 })
  }
  fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\necho "[verify] prepush: current / passed"\n', { mode: 0o755 })
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`)
  return { directory, worktree, head, git, sealProof, request: { head, worktree, raw, prepush } }
}

it.each(['--assume-unchanged', '--skip-worktree'])('rejects %s bytes that passed local gates but are absent from HEAD', flag => {
  const fixture = fixtureWithHiddenChange(flag)
  expect(() => localProof(fixture.request)).toThrow(/committed source.*native\.test\.ts/i)
})

it.each(['--assume-unchanged', '--skip-worktree'])('rejects %s source before run launches a stage', async flag => {
  const result = fixtureWithHiddenChange(flag)
  const config = path.join(result.directory, 'run.json')
  json(config, { head: result.head, batch: 'M01', workspace: path.join(result.directory, 'control'), assignment: 'not-admitted', output: path.join(result.directory, 'output') })

  await expect(runValidation(result.worktree, new Map([['config', config]]))).rejects.toThrow(/committed source.*native\.test\.ts/i)
  expect(fs.existsSync(path.join(result.directory, 'output'))).toBe(false)
})

it.each(['--assume-unchanged', '--skip-worktree'])('accepts %s when actual bytes still match HEAD', flag => {
  const result = fixture()
  result.git('update-index', flag, 'native.test.ts')
  result.sealProof()

  expect(localProof(result.request)).toMatchObject({ head: result.head, tree: result.git('rev-parse', 'HEAD^{tree}') })
})

it('rejects executable mode drift when core.filemode hides it from status', () => {
  const result = fixture()
  result.git('config', 'core.filemode', 'false')
  fs.chmodSync(path.join(result.worktree, 'native.test.ts'), 0o755)
  expect(result.git('status', '--porcelain')).toBe('')

  expect(() => assertCommittedSource(result)).toThrow('committed source native.test.ts: executable mode differs from HEAD')
})

it('rejects a missing tracked file hidden by skip-worktree', () => {
  const result = fixture()
  result.git('update-index', '--skip-worktree', 'native.test.ts')
  fs.unlinkSync(path.join(result.worktree, 'native.test.ts'))
  expect(result.git('status', '--porcelain')).toBe('')

  expect(() => assertCommittedSource(result)).toThrow('committed source native.test.ts: tracked entry is missing')
})

it('hashes symlink targets without following a dangling link and detects hidden retargeting', () => {
  const result = fixture()
  const link = path.join(result.worktree, 'link')
  fs.symlinkSync('../missing-target', link)
  result.git('add', 'link')
  result.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'symlink')
  const source = { worktree: result.worktree, head: result.git('rev-parse', 'HEAD') }
  expect(assertCommittedSource(source)).toMatchObject({ head: source.head })
  result.git('update-index', '--assume-unchanged', 'link')
  fs.unlinkSync(link)
  fs.symlinkSync('../other-missing-target', link)
  expect(result.git('status', '--porcelain')).toBe('')

  expect(() => assertCommittedSource(source)).toThrow('committed source link: bytes differ from HEAD')
})

it.each(['staged', 'untracked'])('retains the %s change rejection after HEAD bytes match', kind => {
  const result = fixture()
  if (kind === 'staged') {
    fs.writeFileSync(path.join(result.worktree, 'native.test.ts'), 'export const staged = true\n')
    result.git('add', 'native.test.ts')
    fs.writeFileSync(path.join(result.worktree, 'native.test.ts'), 'export const value = "committed source"\n')
  } else fs.writeFileSync(path.join(result.worktree, 'extra.ts'), 'export {}\n')

  expect(() => assertCommittedSource(result)).toThrow('committed source has staged or untracked changes')
})

function fixtureWithHiddenChange(flag: string) {
  const result = fixture()
  result.git('update-index', flag, 'native.test.ts')
  fs.writeFileSync(path.join(result.worktree, 'native.test.ts'), 'export const value = "different tested source"\n')
  expect(result.git('status', '--porcelain')).toBe('')
  result.sealProof()
  return result
}
