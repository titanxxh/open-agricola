import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * `.env` is untracked, so `git worktree add` produces a checkout without one.
 * The launcher has to fall back to the main repo's file; otherwise a fresh
 * worktree starts with no GH_TOKEN / OAuth config / API bases, and the first
 * visible symptom is an opaque 403 from the public asset inventory fetch.
 *
 * These tests run the script's own resolution logic against real repos and
 * worktrees rather than asserting on its source text.
 */
const script = readFileSync('restart-local.sh', 'utf8')

const RESOLVER = script.slice(
  script.indexOf('MAIN_REPO_DIR='),
  script.indexOf('# Anchor persistent dev state'),
)
const TOOL_RESOLVER = script.slice(
  script.indexOf('LOCAL_NODE_BIN='),
  script.indexOf('if ! command -v lsof'),
)

/**
 * A name only this test writes, so the assertions never depend on — or print —
 * a real credential such as GH_TOKEN.
 */
const PROBE = 'RESTART_LOCAL_ENV_PROBE'

const dirs: string[] = []

const makeRepo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'env-anchor-'))
  dirs.push(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  writeFileSync(join(dir, 'README.md'), '# test\n')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

const installFakeTools = (root: string): void => {
  const bin = join(root, 'node_modules', '.bin')
  mkdirSync(bin, { recursive: true })
  for (const tool of ['tsx', 'vite']) {
    const path = join(bin, tool)
    writeFileSync(path, '#!/bin/sh\nexit 0\n')
    chmodSync(path, 0o755)
  }
  const dependency = join(root, 'node_modules', 'fake-dependency')
  mkdirSync(dependency, { recursive: true })
  writeFileSync(join(dependency, 'index.js'), 'module.exports = true\n')
}

/**
 * Run the launcher's env-resolution prologue with SCRIPT_DIR pointed at `dir`.
 * The probe variable is stripped from the child environment so the result
 * reflects what the resolved .env supplied, not what the caller happened to
 * export.
 */
const resolveEnvFile = (dir: string): { envFile: string; probe: string } => {
  const env = { ...process.env }
  delete env[PROBE]
  const out = execFileSync('bash', [
    '-c',
    `set -euo pipefail\nSCRIPT_DIR=${JSON.stringify(dir)}\n${RESOLVER}\necho "ENV_FILE=$ENV_FILE"\necho "PROBE=\${${PROBE}:-}"`,
  ], { encoding: 'utf8', env })
  return {
    envFile: /ENV_FILE=(.*)/.exec(out)?.[1] ?? '',
    probe: /PROBE=(.*)/.exec(out)?.[1] ?? '',
  }
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('restart-local env anchoring', () => {
  it('loads the main repo .env when a worktree has none of its own', () => {
    const main = makeRepo()
    writeFileSync(join(main, '.env'), `${PROBE}=from-main\n`)
    const worktree = join(main, '.worktree', 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })

    const resolved = resolveEnvFile(worktree)

    expect(resolved.envFile).toBe(join(main, '.env'))
    expect(resolved.probe).toBe('from-main')
  })

  it('prefers a worktree .env when one exists', () => {
    const main = makeRepo()
    writeFileSync(join(main, '.env'), `${PROBE}=from-main\n`)
    const worktree = join(main, '.worktree', 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })
    writeFileSync(join(worktree, '.env'), `${PROBE}=from-worktree\n`)

    const resolved = resolveEnvFile(worktree)

    expect(resolved.envFile).toBe(join(worktree, '.env'))
    expect(resolved.probe).toBe('from-worktree')
  })

  it('uses its own .env when run from the main repo', () => {
    const main = makeRepo()
    writeFileSync(join(main, '.env'), `${PROBE}=from-main\n`)

    const resolved = resolveEnvFile(main)

    expect(resolved.envFile).toBe(join(main, '.env'))
    expect(resolved.probe).toBe('from-main')
  })

  it('starts without an env file when neither repo has one', () => {
    const main = makeRepo()
    const worktree = join(main, '.worktree', 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })

    const resolved = resolveEnvFile(worktree)

    expect(resolved.envFile).toBe(join(main, '.env'))
    expect(resolved.probe).toBe('')
  })
})

describe('restart-local dependency anchoring', () => {
  it('uses the main repo tools when a linked worktree has no local install', () => {
    const main = makeRepo()
    installFakeTools(main)
    const worktreeRoot = mkdtempSync(join(tmpdir(), 'external-worktree-'))
    dirs.push(worktreeRoot)
    const worktree = join(worktreeRoot, 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })

    const output = execFileSync('bash', ['-c', [
      'set -euo pipefail',
      `SCRIPT_DIR=${JSON.stringify(worktree)}`,
      `MAIN_REPO_DIR=${JSON.stringify(main)}`,
      TOOL_RESOLVER,
      'cd "$SCRIPT_DIR"',
      'node -e "require(\'fake-dependency\')"',
      'echo "NODE_BIN_DIR=$NODE_BIN_DIR"',
    ].join('\n')], { encoding: 'utf8' })

    expect(output.trim()).toBe(`NODE_BIN_DIR=${join(main, 'node_modules', '.bin')}`)
    expect(readFileSync(join(worktree, 'node_modules', '.bin', 'tsx'), 'utf8')).toContain('exit 0')
    expect(realpathSync(join(worktree, 'node_modules', 'fake-dependency'))).toBe(
      realpathSync(join(main, 'node_modules', 'fake-dependency')),
    )
  })
})
