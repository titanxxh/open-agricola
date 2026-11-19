import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { formalIdentityBoundary } from '../ci/formal-identity-boundary'

const roots: string[] = []
afterEach(() => { for (const cwd of roots.splice(0)) rmSync(cwd, { recursive: true, force: true }) })

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'oa-identity-tree-')); roots.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-q')
  function put(path: string, content = 'fixture') {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content); git('add', path)
  }
  function snapshot() {
    git('-c', 'user.name=test', '-c', 'user.email=test@example.org', 'commit', '-qm', 'fixture')
    return formalIdentityBoundary(cwd, git('rev-parse', 'HEAD'))
  }
  put('server/index.ts')
  put('package.json', '{"version":"0.12.0","dependencies":{}}')
  return { put, snapshot }
}

it('keeps the accepted boundary across game rules, board UI, documentation and release version changes', () => {
  const f = fixture(), original = f.snapshot()
  for (const path of ['shared/engine/rules.ts', 'server/game/authoritative-session.ts', 'shared/cards/A/A123_FrameBuilder.ts', 'client/components/board/FarmBoard.tsx',
    'client/app/ReplayPage.tsx', 'README.md', 'docs/operations/release.md', 'CHANGELOG.md', 'operations/whats-new.json']) f.put(path)
  f.put('package.json', '{"version":"0.13.0","dependencies":{}}')
  expect(f.snapshot()).toBe(original)
})

it('binds routes, transitive identity runtime imports, authority migration and formal configuration', () => {
  const f = fixture()
  f.put('server/auth.ts', "export { check } from './helpers/auth-helper'\nimport type { Game } from '../shared/game'")
  f.put('server/helpers/auth-helper.ts', "export const check = () => import('./grant')")
  f.put('server/helpers/grant.ts', 'export const grant = true')
  let previous = f.snapshot()
  f.put('shared/game.ts', 'export type Game = {}')
  expect(f.snapshot()).toBe(previous)
  for (const path of ['server/helpers/grant.ts', 'server/database/100-revoke-grants.sql', 'client/app/PageRouter.tsx', 'docker-compose.prod.yml', 'server/prerelease-authority.ts']) {
    f.put(path, 'other'); const current = f.snapshot(); expect(current).not.toBe(previous); previous = current
  }
})

it('requires a new acceptance when a computed identity dependency cannot be classified across revisions', () => {
  const f = fixture()
  f.put('server/auth.ts', 'export const authority = (path: string) => import(path)')
  const before = f.snapshot()
  f.put('shared/dynamic-helper.ts')
  expect(f.snapshot()).not.toBe(before)
})
