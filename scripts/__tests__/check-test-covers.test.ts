import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findTestCoversViolations } from '../check-test-covers'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const repository = (files: Record<string, string>): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'test-covers-'))
  roots.push(root)
  const tree: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: { 'check:thing': 'tsx scripts/check-thing.ts --strict', lint: 'eslint .' } }),
    'scripts/check-thing.ts': 'export {}\n',
    'scripts/release/publish.ts': 'export {}\n',
    'scripts/backup.sh': 'exit 0\n',
    'deploy.sh': 'exit 0\n',
    'client/game/main.ts': 'export {}\n',
    ...files,
  }
  for (const [file, content] of Object.entries(tree)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
  return root
}

const scripts = (root: string) => findTestCoversViolations(root).map(violation => `${violation.file}:${violation.line} ${violation.script}`)

describe('check-test-covers', () => {
  it('requires a covers declaration for a repository script run through the node binary', () => {
    const root = repository({
      'scripts/__tests__/publish.test.ts': [
        "import { spawnSync } from 'node:child_process'",
        "import { resolve } from 'node:path'",
        "const script = resolve(import.meta.dirname, '../release/publish.ts')",
        "spawnSync(process.execPath, ['--import', 'tsx', script, '--dry-run'])",
      ].join('\n'),
      'scripts/__tests__/covered.test.ts': [
        '// @covers scripts/release/',
        "import { spawnSync } from 'node:child_process'",
        "import { resolve } from 'node:path'",
        "spawnSync(process.execPath, [resolve(import.meta.dirname, '../release/publish.ts')])",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual(['scripts/__tests__/publish.test.ts:4 scripts/release/publish.ts'])
  })

  it('treats external commands as outside the repository even when their arguments name scripts', () => {
    const root = repository({
      'scripts/__tests__/external.test.ts': [
        "import { execFileSync, spawnSync } from 'node:child_process'",
        "execFileSync('git', ['add', 'scripts/release/publish.ts'])",
        "spawnSync('docker', ['run', '--rm', 'image', 'bash', 'scripts/backup.sh'])",
        "execFileSync('tar', ['-cf', 'archive.tar', 'deploy.sh'])",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual([])
  })

  it('follows shells, pnpm scripts, namespace imports, aliases and string commands', () => {
    const root = repository({
      'scripts/__tests__/shapes.test.ts': [
        "import * as cp from 'node:child_process'",
        "import { execFile as run, execSync } from 'node:child_process'",
        "import { join } from 'node:path'",
        "const repository = join(import.meta.dirname, '../..')",
        "cp.spawnSync('/bin/bash', [join(repository, 'deploy.sh'), 'host'])",
        "run('pnpm', ['run', 'check:thing'])",
        "run('pnpm', ['lint'])",
        "execSync('bash scripts/backup.sh --now')",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual([
      'scripts/__tests__/shapes.test.ts:5 deploy.sh',
      'scripts/__tests__/shapes.test.ts:6 scripts/check-thing.ts',
      'scripts/__tests__/shapes.test.ts:8 scripts/backup.sh',
    ])
  })

  it('resolves a wrapper parameter from its call sites and a copied tree by its path suffix', () => {
    const root = repository({
      'scripts/__tests__/wrapper.test.ts': [
        "import { spawnSync } from 'node:child_process'",
        "import { join } from 'node:path'",
        'declare const stage: string',
        "const invoke = (script: string, args: string[]) => spawnSync(process.execPath, [join(stage, script), ...args])",
        "invoke('scripts/release/publish.ts', ['status'])",
        "spawnSync(process.execPath, [join(stage, 'policy/scripts/release/publish.ts')])",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual([
      'scripts/__tests__/wrapper.test.ts:4 scripts/release/publish.ts',
      'scripts/__tests__/wrapper.test.ts:6 scripts/release/publish.ts',
    ])
  })

  it('keeps every script a reused wrapper receives', () => {
    const root = repository({
      'scripts/__tests__/reused.test.ts': [
        "import { spawnSync } from 'node:child_process'",
        "import { join } from 'node:path'",
        "const repository = join(import.meta.dirname, '../..')",
        "const invoke = (script: string) => spawnSync(process.execPath, [join(repository, script)])",
        "invoke('scripts/release/publish.ts')",
        "invoke('scripts/release/publish.ts')",
        "invoke('scripts/check-thing.ts')",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual([
      'scripts/__tests__/reused.test.ts:4 scripts/release/publish.ts',
      'scripts/__tests__/reused.test.ts:4 scripts/check-thing.ts',
    ])
  })

  it('does not resolve a bare file name in an unknown working directory against the repository', () => {
    const root = repository({
      'scripts/__tests__/fixture.test.ts': [
        "import { spawnSync } from 'node:child_process'",
        'declare const temporary: string',
        "spawnSync(process.execPath, ['--import', 'tsx', 'main.ts'], { cwd: temporary })",
        "spawnSync('bash', ['deploy.sh'], { cwd: temporary })",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual([])
  })

  it('checks test helpers, whose declarations reach the tests that import them', () => {
    const root = repository({
      'server/__tests__/_helpers/runner.ts': [
        "import { spawn } from 'node:child_process'",
        "export const start = () => spawn('node', ['scripts/release/publish.ts'])",
      ].join('\n'),
      'server/production.ts': [
        "import { spawn } from 'node:child_process'",
        "export const start = () => spawn('node', ['scripts/release/publish.ts'])",
      ].join('\n'),
    })

    expect(scripts(root)).toEqual(['server/__tests__/_helpers/runner.ts:2 scripts/release/publish.ts'])
  })
})
