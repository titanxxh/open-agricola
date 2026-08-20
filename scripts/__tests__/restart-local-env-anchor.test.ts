import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** Run the launcher's env-resolution prologue with SCRIPT_DIR pointed at `dir`. */
const resolveEnvFile = (dir: string): { envFile: string; token: string } => {
  const out = execFileSync('bash', [
    '-c',
    `set -euo pipefail\nSCRIPT_DIR=${JSON.stringify(dir)}\n${RESOLVER}\necho "ENV_FILE=$ENV_FILE"\necho "TOKEN=\${GH_TOKEN:-}"`,
  ], { encoding: 'utf8' })
  return {
    envFile: /ENV_FILE=(.*)/.exec(out)?.[1] ?? '',
    token: /TOKEN=(.*)/.exec(out)?.[1] ?? '',
  }
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('restart-local env anchoring', () => {
  it('loads the main repo .env when a worktree has none of its own', () => {
    const main = makeRepo()
    writeFileSync(join(main, '.env'), 'GH_TOKEN=from-main\n')
    const worktree = join(main, '.worktree', 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })

    const resolved = resolveEnvFile(worktree)

    expect(resolved.envFile).toBe(join(main, '.env'))
    expect(resolved.token).toBe('from-main')
  })

  it('prefers a worktree .env when one exists', () => {
    const main = makeRepo()
    writeFileSync(join(main, '.env'), 'GH_TOKEN=from-main\n')
    const worktree = join(main, '.worktree', 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })
    writeFileSync(join(worktree, '.env'), 'GH_TOKEN=from-worktree\n')

    const resolved = resolveEnvFile(worktree)

    expect(resolved.envFile).toBe(join(worktree, '.env'))
    expect(resolved.token).toBe('from-worktree')
  })

  it('uses its own .env when run from the main repo', () => {
    const main = makeRepo()
    writeFileSync(join(main, '.env'), 'GH_TOKEN=from-main\n')

    const resolved = resolveEnvFile(main)

    expect(resolved.envFile).toBe(join(main, '.env'))
    expect(resolved.token).toBe('from-main')
  })

  it('starts without an env file when neither repo has one', () => {
    const main = makeRepo()
    const worktree = join(main, '.worktree', 'feature')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', worktree], { cwd: main })

    const resolved = resolveEnvFile(worktree)

    expect(resolved.envFile).toBe(join(main, '.env'))
    expect(resolved.token).toBe('')
  })
})
