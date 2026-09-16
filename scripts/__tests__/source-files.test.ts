import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { walkSourceFiles } from '../source-files'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
})

const fixture = (files: readonly string[]): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-files-'))
  roots.push(root)
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), 'export {}\n')
  }
  return root
}

const relative = (root: string, files: readonly string[]): string[] =>
  files.map((file) => path.relative(root, file).replaceAll(path.sep, '/'))

it('scans artifact-named directories that are not git-ignored and always skips node_modules and .git', () => {
  const root = fixture([
    'src/coverage/report.ts',
    'src/dist/bundle.ts',
    'src/test-results/case.ts',
    'src/node_modules/dep/index.ts',
    'src/.git/hook.ts',
    'src/keep.ts',
  ])

  expect(relative(root, walkSourceFiles(path.join(root, 'src')))).toEqual([
    'src/coverage/report.ts',
    'src/dist/bundle.ts',
    'src/keep.ts',
    'src/test-results/case.ts',
  ])
})

it('skips artifact-named directories only when the checkout ignores them', () => {
  const root = fixture([
    'src/coverage/report.ts',
    'src/test-results/case.ts',
    'src/keep.ts',
  ])
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
  vi.stubEnv('XDG_CONFIG_HOME', path.join(root, 'xdg'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  fs.writeFileSync(path.join(root, '.gitignore'), 'test-results/\n')

  expect(relative(root, walkSourceFiles(path.join(root, 'src')))).toEqual([
    'src/coverage/report.ts',
    'src/keep.ts',
  ])
})
