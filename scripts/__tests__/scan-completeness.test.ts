import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-scan-'))
  roots.push(root)
  return root
}
const scripts = path.resolve(import.meta.dirname, '..')

it('fails when discovery roots disappear or a test is added outside project globs', () => {
  const root = fixture()
  const run = () => spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.join(scripts, 'check-test-project-coverage.ts')], { cwd: root, encoding: 'utf8' })
  expect(run().status).toBe(1)
  for (const directory of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) fs.mkdirSync(path.join(root, directory))
  expect(run().status).toBe(0)
  fs.mkdirSync(path.join(root, 'new-feature'))
  fs.writeFileSync(path.join(root, 'new-feature', 'probe.test.ts'), 'export {}')
  const result = run()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('new-feature/probe.test.ts')
})

it('fails the bundle CLI without build evidence even in loose mode', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, 'scripts'))
  const script = path.join(root, 'scripts', 'check-bundle-size.ts')
  fs.copyFileSync(path.join(scripts, 'check-bundle-size.ts'), script)
  const run = () => spawnSync(process.execPath, [script, '--loose'], { cwd: root, encoding: 'utf8' })
  expect(run().status).toBe(1)
  fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true })
  expect(run().status).toBe(1)
  fs.writeFileSync(path.join(root, 'dist', 'assets', 'index-probe.js'), 'export {}')
  expect(run().status).toBe(0)
})
