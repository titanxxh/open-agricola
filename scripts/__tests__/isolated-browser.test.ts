import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isolatedBrowserCli } from '../ci/isolated-browser'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'isolated-browser-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'session'))
  return root
}

describe('routine browser environment', () => {
  it('creates and cleans a TypeScript environment with extensionless imports through tsx', () => {
    const root = fixture()
    symlinkSync(resolve(import.meta.dirname, '../../node_modules'), join(root, 'node_modules'), 'dir')
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'scripts/value.ts'), 'export const databaseSchema: string = "test_fixture"')
    writeFileSync(join(root, 'scripts/test-environment.ts'), `import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { databaseSchema } from './value'
const [operation, session] = process.argv.slice(2)
if (operation === 'create') writeFileSync(join(session, 'test.env'), 'DATABASE_SCHEMA=' + databaseSchema + '\\n')
`)
    writeFileSync(join(root, 'restart-local.sh'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(root, 'restart-local.sh'), 0o755)
    expect(isolatedBrowserCli(root, ['start', 'session'])).toBe(0)
    expect(readFileSync(join(root, 'session/test.env'), 'utf8')).toContain('test_fixture')
    expect(isolatedBrowserCli(root, ['stop', 'session'])).toBe(0)
    expect(existsSync(join(root, 'session/test.env'))).toBe(false)
  })

  it('cleans a failed startup and reports a failed stop while removing environment credentials', () => {
    const root = fixture()
    const calls: string[][] = []
    const run = (command: string, args: string[]) => {
      calls.push([command, ...args])
      if (args.includes('create')) writeFileSync(join(root, 'session/test.env'), 'DATABASE_SCHEMA=test_fixture\n')
      return command === './restart-local.sh' ? 7 : 0
    }
    expect(isolatedBrowserCli(root, ['start', 'session'], run)).toBe(7)
    expect(calls.some(args => args.includes('cleanup'))).toBe(true)
    expect(existsSync(join(root, 'session/test.env'))).toBe(false)
    writeFileSync(join(root, 'session/test.env'), 'DATABASE_SCHEMA=test_fixture\n')
    expect(isolatedBrowserCli(root, ['stop', 'session'], run)).toBe(7)
  })

  it('passes engine, retry and grep selectors and replaces an earlier report', () => {
    const root = fixture()
    writeFileSync(join(root, 'session/test.env'), 'FRONTEND_URL=http://127.0.0.1:12345\n')
    writeFileSync(join(root, 'session/report.json'), '{"old":true}')
    expect(isolatedBrowserCli(root, ['test', 'session', '--report', 'session/report.json', '--retries', '1', '--browser', 'webkit', '--grep', '@webkit', '--', 'e2e-tests/view.spec.ts'], (command, args, cwd, env) => {
      expect(command).toBe('pnpm')
      expect(cwd).toBe(root)
      expect(args).toEqual(['exec', 'playwright', 'test', 'e2e-tests/view.spec.ts', '--browser=webkit', '--retries=1', '--reporter=dot,json', '--grep', '@webkit'])
      expect(env?.FRONTEND_URL).toBe('http://127.0.0.1:12345')
      expect(env?.PLAYWRIGHT_JSON_OUTPUT_FILE).toBe(join(root, 'session/report.json'))
      expect(existsSync(join(root, 'session/report.json'))).toBe(false)
      return 0
    })).toBe(0)
  })
})
