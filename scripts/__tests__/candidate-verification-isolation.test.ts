import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { collectCandidateDiagnostics, displayCandidateLog, verifyCandidateSources } from '../ci/candidate-isolation'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-ci-isolation-')); roots.push(root)
  const source = join(root, 'source'), work = join(root, 'work'), output = join(root, 'private')
  for (const path of [source, work, output]) mkdirSync(path, { mode: 0o700 })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: source, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init'); git('config', 'user.name', 'Isolation'); git('config', 'user.email', 'isolation@example.test')
  writeFileSync(join(source, 'source.txt'), 'fixed source\n'); writeFileSync(join(source, '.gitignore'), 'output/\nnode_modules/\n')
  git('add', '.'); git('commit', '-m', 'source')
  execFileSync('cp', ['-a', source + '/.', work])
  return { root, source, work, output, sha: git('rev-parse', 'HEAD') }
}
it('checks fixed source bytes without consuming writable candidate Git callbacks', () => {
  const value = fixture(), marker = join(value.root, 'inert-marker')
  writeFileSync(join(value.work, '.git/config'), `[core]\nfsmonitor = touch ${marker}\n`)
  verifyCandidateSources(value.source, value.work, value.sha)
  expect(() => readFileSync(marker)).toThrow()
  writeFileSync(join(value.work, 'source.txt'), 'changed\n')
  expect(() => verifyCandidateSources(value.source, value.work, value.sha)).toThrow(/source.txt/)
})
it('collects only regular independent diagnostics, refusing symlink directories and hardlinks', () => {
  const value = fixture()
  mkdirSync(join(value.work, 'output/verification'), { recursive: true })
  const sentinel = join(value.root, 'sentinel'); writeFileSync(sentinel, 'private inert bytes')
  writeFileSync(join(value.work, 'output/verification/result.json'), '{"completed":true}')
  symlinkSync(sentinel, join(value.work, 'output/verification/link.json'))
  linkSync(sentinel, join(value.work, 'output/verification/hard.json'))
  symlinkSync(value.root, join(value.work, 'output/playwright'))
  collectCandidateDiagnostics(value.work, value.output)
  expect(readFileSync(join(value.output, 'output/verification/result.json'), 'utf8')).toBe('{"completed":true}')
  for (const path of ['output/verification/link.json', 'output/verification/hard.json', 'output/playwright/sentinel']) expect(() => readFileSync(join(value.output, path))).toThrow()
  expect(readFileSync(sentinel, 'utf8')).toBe('private inert bytes')
})
it('renders captured output without inline workflow commands or carriage-return commands', () => {
  const value = fixture(), log = join(value.root, 'task.log')
  writeFileSync(log, 'text ::error::inert\r::set-output name=x::inert\n##[error]inert\n')
  expect(displayCandidateLog(log)).toBe('text %3A%3Aerror%3A%3Ainert%0D%3A%3Aset-output name=x%3A%3Ainert\n%23%23[error]inert\n')
})
