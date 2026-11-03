import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const FULL_TASK_IDS = [
  'quality', 'fast', 'slow', 'build',
  'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit',
] as const

export type FullTaskId = typeof FULL_TASK_IDS[number]
export type VerificationCommand = { command: string; args: string[] }
export type VerificationTask = { id: FullTaskId; browser: 'chromium' | 'webkit' | null; services: boolean }

export function verificationTask(id: string): VerificationTask {
  const task = FULL_TASK_IDS.find(candidate => candidate === id)
  if (!task) throw new Error(`Unknown complete verification task: ${id}`)
  return {
    id: task,
    browser: task === 'webkit' ? 'webkit'
      : task.startsWith('chromium-') || task === 'browser-sandbox' ? 'chromium' : null,
    services: task === 'fast' || task === 'slow',
  }
}

export function selectedTasks(value: string): FullTaskId[] {
  const requested = value === 'all' ? [...FULL_TASK_IDS] : value.split(',').map(id => verificationTask(id).id)
  if (!requested.length || new Set(requested).size !== requested.length) throw new Error('Select unique complete verification tasks')
  return FULL_TASK_IDS.filter(id => requested.includes(id))
}

function architectureCommands(cwd: string): VerificationCommand[] {
  const value: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  if (typeof value !== 'object' || value === null || !('scripts' in value)
    || typeof value.scripts !== 'object' || value.scripts === null
    || !('check:architecture' in value.scripts) || typeof value.scripts['check:architecture'] !== 'string') {
    throw new Error('Missing canonical architecture checks')
  }
  return value.scripts['check:architecture'].split(' && ')
    .filter(command => command !== 'pnpm run check:architecture-tests' && command !== 'pnpm run check:test-project-coverage')
    .map(command => {
      const match = /^pnpm run ([a-z0-9:-]+)(?: -- (.*))?$/.exec(command)
      if (!match) throw new Error(`Unsupported canonical architecture command: ${command}`)
      return { command: 'pnpm', args: ['run', match[1], ...(match[2] ? ['--', ...match[2].split(' ')] : [])] }
    })
}

function chromiumSuite(cwd: string): string[] {
  const found: string[] = []
  const visit = (relativeDirectory: string) => {
    for (const name of readdirSync(join(cwd, relativeDirectory)).sort()) {
      const relative = `${relativeDirectory}/${name}`
      if (statSync(join(cwd, relative)).isDirectory()) visit(relative)
      else if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(name)) found.push(relative)
    }
  }
  visit('e2e-tests')
  return found
}

function recordedDurations(cwd: string): Map<string, number> {
  const path = join(cwd, 'scripts/ci/verification-durations.json')
  if (!existsSync(path)) return new Map()
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Browser spec durations must be a path map')
  const durations = new Map<string, number>()
  for (const [spec, duration] of Object.entries(value)) {
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid browser spec duration: ${spec}`)
    durations.set(spec, duration)
  }
  return durations
}

function medianDuration(durations: number[]): number {
  if (!durations.length) return 1
  const ordered = [...durations].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function chromiumCommands(cwd: string, shard: number): VerificationCommand[] {
  const recorded = recordedDurations(cwd)
  const specs = chromiumSuite(cwd)
  const median = medianDuration(specs.flatMap(spec => {
    const duration = recorded.get(spec)
    return duration === undefined ? [] : [duration]
  }))
  const ranked = specs
    .map(spec => ({ spec, duration: recorded.get(spec) ?? median }))
    .sort((left, right) => right.duration - left.duration || (left.spec < right.spec ? -1 : left.spec > right.spec ? 1 : 0))
  const bins: { total: number; specs: string[] }[] = [
    { total: 0, specs: [] }, { total: 0, specs: [] }, { total: 0, specs: [] }, { total: 0, specs: [] },
  ]
  for (const item of ranked) {
    let chosen = 0
    for (let index = 1; index < bins.length; index++) if (bins[index].total < bins[chosen].total) chosen = index
    bins[chosen].specs.push(item.spec)
    bins[chosen].total += item.duration
  }
  const selected = bins[shard].specs.sort()
  return selected.length ? [{ command: 'pnpm', args: ['verify', ...selected] }] : []
}

export function taskCommands(cwd: string, input: string): VerificationCommand[] {
  const task = verificationTask(input)
  switch (task.id) {
    case 'quality': return [...architectureCommands(cwd), { command: 'pnpm', args: ['run', 'lint:i18n'] }]
    case 'fast': return [{ command: 'pnpm', args: ['test:fast'] }]
    case 'slow': return [{ command: 'pnpm', args: ['test:slow'] }]
    case 'build': return [
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'build:replay-viewer'] },
      { command: 'pnpm', args: ['run', 'check:bundle-size'] },
    ]
    case 'chromium-1': return chromiumCommands(cwd, 0)
    case 'chromium-2': return chromiumCommands(cwd, 1)
    case 'chromium-3': return chromiumCommands(cwd, 2)
    case 'chromium-4': return chromiumCommands(cwd, 3)
    case 'browser-sandbox': return [{ command: 'pnpm', args: ['run', 'verify:e2e:browser-sandbox'] }]
    case 'webkit': return [{ command: 'pnpm', args: ['run', 'verify:e2e:webkit'] }]
  }
}

export function fullSha(value: string): string {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('Candidate must be a full lowercase commit SHA')
  return value
}

const configurationPath = (file: string): boolean =>
  file === '.github/workflows/candidate-verification.yml'
  || file.startsWith('scripts/ci/')
  || /^scripts\/verification[^/]*\.ts$/.test(file)
  || /^scripts\/verify[^/]*\.(?:ts|sh)$/.test(file)
  || file === 'scripts/test-project-globs.ts'
  || file === 'scripts/release/requirements.json'
  || ['package.json', 'pnpm-lock.yaml', 'vitest.config.ts', 'playwright.config.ts', 'vite.config.ts'].includes(file)
  || /^tsconfig[^/]*\.json$/.test(file)

export function verificationConfiguration(cwd: string, sha: string): string {
  fullSha(sha)
  const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  const files = git(['ls-tree', '-r', '--name-only', sha]).trim().split('\n').filter(configurationPath).sort()
  for (const required of ['.github/workflows/candidate-verification.yml', 'scripts/ci/verification-tasks.ts', 'scripts/ci/candidate-verification.ts', 'package.json', 'pnpm-lock.yaml']) {
    if (!files.includes(required)) throw new Error(`Candidate lacks complete verification configuration: ${required}`)
  }
  const hash = createHash('sha256').update('open-agricola-full-verification-v1\0')
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd, input: files.map(file => `${sha}:${file}\n`).join(''), maxBuffer: 64 * 1024 * 1024,
  })
  let offset = 0
  for (const file of files) {
    const headerEnd = blobs.indexOf(10, offset)
    const header = headerEnd < 0 ? null : /^[a-f0-9]{40} blob (0|[1-9]\d*)$/.exec(blobs.subarray(offset, headerEnd).toString('utf8'))
    if (!header) throw new Error(`Invalid verification configuration blob header: ${file}`)
    const size = Number(header[1])
    const start = headerEnd + 1
    const end = start + size
    if (!Number.isSafeInteger(size) || end >= blobs.length || blobs[end] !== 10) {
      throw new Error(`Incomplete verification configuration blob: ${file}`)
    }
    hash.update(file + '\0').update(blobs.subarray(start, end).toString('utf8')).update('\0')
    offset = end + 1
  }
  if (offset !== blobs.length) throw new Error('Unexpected verification configuration blob output')
  return hash.digest('hex')
}
