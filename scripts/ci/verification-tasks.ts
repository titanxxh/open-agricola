import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, lstatSync } from 'node:fs'
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
  const path = join(cwd, 'package.json')
  if (!lstatSync(path).isFile()) throw new Error('Candidate package.json must be a regular file')
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
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
    if (!lstatSync(join(cwd, relativeDirectory)).isDirectory()) throw new Error('Candidate browser suite must contain only regular files and directories')
    for (const name of readdirSync(join(cwd, relativeDirectory)).sort()) {
      const relative = `${relativeDirectory}/${name}`
      const entry = lstatSync(join(cwd, relative))
      if (!entry.isFile() && !entry.isDirectory()) throw new Error('Candidate browser suite must contain only regular files and directories')
      if (entry.isDirectory()) visit(relative)
      else if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(name)) found.push(relative)
    }
  }
  visit('e2e-tests')
  return found.sort()
}

/** Measured seconds per browser spec file; part of the verification configuration (scripts/ci/). */
export function browserSpecWeights(): Record<string, number> {
  const value: unknown = JSON.parse(readFileSync(join(import.meta.dirname, 'browser-spec-weights.json'), 'utf8'))
  const files = typeof value === 'object' && value !== null && 'files' in value ? value.files : null
  if (typeof files !== 'object' || files === null || Array.isArray(files)
    || !Object.values(files).every(weight => typeof weight === 'number' && Number.isFinite(weight) && weight >= 0)) throw new Error('Invalid browser spec weight table')
  return Object.fromEntries(Object.entries(files).map(([file, weight]) => [file, Number(weight)]))
}

/**
 * Deterministic longest-first packing of files into `groups` by weight: each file goes to the lightest group so far
 * (lowest index on ties), heavier files first, ties by path. Files missing from the table weigh the table's median,
 * so new specs need no scheduling metadata. Every file lands in exactly one group; each group's files are sorted.
 */
export function weightedAssignment(files: readonly string[], groups: number, weights: Record<string, number>): string[][] {
  if (!Number.isSafeInteger(groups) || groups < 1) throw new Error('Weighted assignment needs at least one group')
  const known = Object.values(weights).sort((a, b) => a - b)
  const median = known.length ? known[Math.floor(known.length / 2)] : 1
  const items = [...new Set(files)].map(file => ({ file, weight: weights[file] ?? median }))
    .sort((a, b) => b.weight - a.weight || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const bins = Array.from({ length: groups }, () => ({ files: [] as string[], total: 0 }))
  for (const item of items) {
    const lightest = bins.reduce((best, bin) => bin.total < best.total ? bin : best)
    lightest.files.push(item.file)
    lightest.total += item.weight
  }
  return bins.map(bin => bin.files.sort())
}

// Each task runs its files through `verify:parallel`, which splits them further into lanes when the machine sets
// VERIFY_PARALLEL_LANES (default one lane: an in-place `pnpm verify`).
function chromiumCommands(cwd: string, shard: number): VerificationCommand[] {
  const selected = weightedAssignment(chromiumSuite(cwd), 4, browserSpecWeights())[shard]
  return selected.length ? [{ command: 'pnpm', args: ['verify:parallel', ...selected] }] : []
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
  (file === '.github/workflows/candidate-verification.yml' || file === '.github/workflows/prerelease-candidate-verification.yml' || file === '.github/workflows/candidate-rehearsal.yml')
  || file.startsWith('scripts/ci/')
  || /^scripts\/verification[^/]*\.ts$/.test(file)
  || /^scripts\/verify[^/]*\.(?:ts|sh|mjs)$/.test(file)
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
