import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Step = { name: string; command: string; args: string[] }
type Plan = { mode: 'focus' | 'prepush' | 'e2e'; steps: Step[] }
type RunCommand = (command: string, args: string[], cwd: string) => number
type VerificationRecord = {
  fingerprint: string
  head: string
  node: string
  mode: Plan['mode']
  startedAt: string
  completedAt?: string
  status: 'running' | 'passed' | 'failed' | 'stale'
  steps: Array<Step & { status: 'passed' | 'failed'; exitCode: number }>
  error?: string
}

const modes = ['focus', 'prepush', 'e2e'] as const
const recordDirectory = 'output/verification'
const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd()

/** Includes staged, unstaged, untracked and deleted sources; records never hash themselves. */
export function sourceFingerprint(cwd: string): string {
  const hash = createHash('sha256')
  hash.update(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    environment: ['NODE_ENV', 'NODE_OPTIONS', 'CI', 'TZ', 'VITE_SANDBOX_EXECUTOR', 'APP_INSTANCES']
      .map(key => [key, process.env[key] ?? null]),
  }))
  const files = [...new Set(git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0').filter(Boolean))].sort()
  for (const file of files) {
    if (file.startsWith(`${recordDirectory}/`)) continue
    hash.update(`${file}\0`)
    const target = join(cwd, file)
    let stat
    try { stat = lstatSync(target) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      hash.update('deleted\0')
      continue
    }
    if (stat.isSymbolicLink()) hash.update(`symlink:${readlinkSync(target)}\0`)
    else if (stat.isFile()) {
      hash.update(`file:${stat.mode & 0o111}:${stat.size}\0`)
      hash.update(readFileSync(target))
      hash.update('\0')
    } else throw new Error(`Cannot fingerprint source: ${file}`)
  }
  return hash.digest('hex')
}

export function verificationPlan(cwd: string, input: string[]): Plan {
  const args = [...input]
  if (args[0] === '--') args.shift()
  const mode = args[0]
  if (mode === 'focus' || mode === 'prepush' || mode === 'e2e') args.shift()
  if (args[0] === '--') args.shift()
  if (mode === 'focus') {
    const first = args[0]
    if (!first || !/\.test\.[cm]?[jt]sx?$/.test(first) || !existsSync(resolve(cwd, first))) {
      throw new Error('Usage: pnpm verify focus <existing Vitest test file> [files/options]. Use pnpm verify <spec> for Playwright.')
    }
    return { mode, steps: [
      { name: 'cards-manifest', command: 'pnpm', args: ['run', 'build:cards-manifest'] },
      { name: 'focused-tests', command: 'pnpm', args: ['exec', 'vitest', 'run', ...args] },
    ] }
  }
  if (mode === 'prepush') {
    if (args.length) throw new Error('prepush always runs the complete fast suite and lint; it accepts no filters')
    return { mode, steps: [
      { name: 'test-services', command: process.execPath, args: ['scripts/local-services.mjs', '--test'] },
      { name: 'fast', command: 'pnpm', args: ['test:fast'] },
      { name: 'lint', command: 'pnpm', args: ['run', 'lint'] },
    ] }
  }
  // Preserve the existing pnpm verify [Playwright args] contract, including no arguments.
  return { mode: 'e2e', steps: [{ name: 'browser-tests', command: 'bash', args: ['scripts/verify.sh', ...args] }] }
}

const runCommand: RunCommand = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

export function runVerification(cwd: string, plan: Plan, run: RunCommand = runCommand): VerificationRecord {
  const record: VerificationRecord = {
    fingerprint: sourceFingerprint(cwd), head: git(cwd, ['rev-parse', 'HEAD']), node: process.version,
    mode: plan.mode, startedAt: new Date().toISOString(), status: 'running', steps: [],
  }
  const directory = join(cwd, recordDirectory)
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${plan.mode}.json`)
  const save = () => writeFileSync(path, JSON.stringify(record, null, 2) + '\n')
  save()
  try {
    for (const step of plan.steps) {
      console.log(`[verify] ${step.name}: ${step.command} ${step.args.join(' ')}`)
      const exitCode = run(step.command, step.args, cwd)
      record.steps.push({ ...step, status: exitCode === 0 ? 'passed' : 'failed', exitCode })
      save()
      if (exitCode !== 0) throw new Error(`${step.name} failed (exit ${exitCode})`)
      if (sourceFingerprint(cwd) !== record.fingerprint) {
        record.status = 'stale'
        throw new Error('Sources changed during verification; rerun against the final version')
      }
    }
    record.status = 'passed'
  } catch (error) {
    if (record.status !== 'stale') record.status = 'failed'
    record.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    record.completedAt = new Date().toISOString()
    save()
    console.log(`[verify] ${record.status}: ${relative(cwd, path)} (${record.fingerprint.slice(0, 12)})`)
  }
  return record
}

export function verificationStatus(cwd: string) {
  const fingerprint = sourceFingerprint(cwd)
  return modes.map(mode => {
    const path = join(cwd, recordDirectory, `${mode}.json`)
    const record = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as VerificationRecord : null
    return { mode, current: record?.fingerprint === fingerprint, record }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'))
  try {
    if (args[0] === 'status') {
      if (args.length > 1) throw new Error('Usage: pnpm verify status')
      const statuses = verificationStatus(cwd)
      for (const { mode, current, record } of statuses) {
        console.log(`[verify] ${mode}: ${record ? `${current ? 'current' : 'stale'} / ${record.status}` : 'not recorded'}`)
        for (const step of record?.steps ?? []) console.log(`  ${step.status}: ${step.command} ${step.args.join(' ')}`)
      }
      process.exitCode = statuses.some(({ mode, current, record }) => mode === 'prepush' && current && record?.status === 'passed') ? 0 : 1
    } else runVerification(cwd, verificationPlan(cwd, args))
  } catch (error) {
    console.error(`[verify] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
