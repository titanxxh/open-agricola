#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, parseEnv } from 'node:util'

type Runner = (command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => number
const execute: Runner = (command, args, cwd, env = process.env) => {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

export function isolatedBrowserCli(root: string, args: string[], run: Runner = execute): number {
  const [action, directory, ...rest] = args
  if (!directory || (action !== 'start' && action !== 'stop' && action !== 'test')) {
    throw new Error('Usage: isolated-browser.ts start|stop|test <session> [--report file --retries n --browser name [--grep pattern] -- files]')
  }
  const session = resolve(root, directory)
  const envPath = join(session, 'test.env')
  const savedEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...parseEnv(readFileSync(envPath, 'utf8')) })
  const environment = (operation: string, env?: NodeJS.ProcessEnv) =>
    run('pnpm', ['exec', 'tsx', 'scripts/test-environment.ts', operation, session], root, env)
  const stop = (): number => {
    const env = savedEnv()
    try {
      const killed = run('./restart-local.sh', ['--kill-only'], root, env)
      const cleaned = environment('cleanup', env)
      return killed || cleaned
    } finally {
      for (const file of ['test.env', 'dependencies.local', 'dependencies.compose.env']) rmSync(join(session, file), { force: true })
    }
  }
  if (action === 'start') {
    mkdirSync(session, { recursive: true })
    const created = environment('create')
    if (created !== 0) return created
    let started: number
    try {
      started = run('./restart-local.sh', ['--instances', process.env.APP_INSTANCES ?? '1'], root, { ...savedEnv(), LOCAL_DEPENDENCIES_READY: '1' })
    } catch (error) {
      stop()
      throw error
    }
    if (started !== 0) stop()
    return started
  }
  if (action === 'stop') return stop()

  const { values, positionals: files } = parseArgs({ args: rest, allowPositionals: true, options: {
    report: { type: 'string' }, retries: { type: 'string' }, browser: { type: 'string' }, grep: { type: 'string' },
  } })
  if (!values.report || !values.retries || !values.browser || !files.length) throw new Error('Browser test is missing its report, retry count, browser, or spec files')
  const report = resolve(root, values.report)
  rmSync(report, { force: true })
  const env: NodeJS.ProcessEnv = { ...savedEnv(), PLAYWRIGHT_JSON_OUTPUT_FILE: report }
  if (process.platform === 'linux') {
    env.LIBGL_ALWAYS_SOFTWARE ??= '1'
    env.WEBKIT_SKIA_ENABLE_CPU_RENDERING ??= '1'
    const mesa = '/usr/share/glvnd/egl_vendor.d/50_mesa.json'
    if (existsSync(mesa)) env.__EGL_VENDOR_LIBRARY_FILENAMES ??= mesa
  }
  const testArgs = ['exec', 'playwright', 'test', ...files, `--browser=${values.browser}`, `--retries=${values.retries}`, '--reporter=dot,json']
  if (values.grep) testArgs.push('--grep', values.grep)
  return run('pnpm', testArgs, root, env)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = isolatedBrowserCli(resolve(import.meta.dirname, '../..'), process.argv.slice(2))
}
