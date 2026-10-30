import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
    case 'chromium-1': return [{ command: 'pnpm', args: ['verify', '--shard=1/4'] }]
    case 'chromium-2': return [{ command: 'pnpm', args: ['verify', '--shard=2/4'] }]
    case 'chromium-3': return [{ command: 'pnpm', args: ['verify', '--shard=3/4'] }]
    case 'chromium-4': return [{ command: 'pnpm', args: ['verify', '--shard=4/4'] }]
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
  for (const file of files) hash.update(file + '\0').update(git(['show', `${sha}:${file}`])).update('\0')
  return hash.digest('hex')
}
