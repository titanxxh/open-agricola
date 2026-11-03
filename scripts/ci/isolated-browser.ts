#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'

const root = resolve(import.meta.dirname, '../..')
const [action, directory, ...rest] = process.argv.slice(2)
if (!directory || (action !== 'start' && action !== 'stop' && action !== 'test')) {
  throw new Error('Usage: isolated-browser.ts start|stop|test <session> [--report file --retries n --browser name [--grep pattern] -- files]')
}
const session = resolve(root, directory)
const envPath = join(session, 'test.env')
const savedEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...parseEnv(readFileSync(envPath, 'utf8')) })
const finish = (status: number | null) => process.exit(status ?? 1)

if (action === 'start') {
  mkdirSync(session, { recursive: true })
  const created = spawnSync(process.execPath, ['scripts/test-environment.ts', 'create', session], { cwd: root, stdio: 'inherit' })
  if (created.status !== 0) finish(created.status)
  const started = spawnSync('./restart-local.sh', [], { cwd: root, env: savedEnv(), stdio: 'inherit' })
  finish(started.status)
}

if (action === 'stop') {
  const env = savedEnv()
  spawnSync('./restart-local.sh', ['--kill-only'], { cwd: root, env, stdio: 'inherit' })
  const cleaned = spawnSync(process.execPath, ['scripts/test-environment.ts', 'cleanup', session], { cwd: root, env, stdio: 'inherit' })
  finish(cleaned.status)
}

const value = (flag: string) => {
  const index = rest.indexOf(flag)
  const argument = index < 0 ? undefined : rest[index + 1]
  if (!argument || argument.startsWith('--')) throw new Error(`Browser test is missing ${flag}`)
  return argument
}
const report = value('--report')
const retries = value('--retries')
const browser = value('--browser')
const grepIndex = rest.indexOf('--grep')
const grep = grepIndex < 0 ? undefined : rest[grepIndex + 1]
const files = rest.slice(rest.indexOf('--') + 1)
if (rest.indexOf('--') < 0 || !files.length) throw new Error('Browser test is missing its spec files')
const args = ['exec', 'playwright', 'test', ...files, `--browser=${browser}`, `--retries=${retries}`, '--reporter=json']
if (grep && !grep.startsWith('--')) args.push('--grep', grep)
const result = spawnSync('pnpm', args, {
  cwd: root,
  env: { ...savedEnv(), PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(root, report) },
  stdio: 'inherit',
})
finish(result.status)
