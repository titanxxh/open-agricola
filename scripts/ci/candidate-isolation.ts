import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fullSha } from './verification-tasks.ts'

export type CandidateExecution = {
  uid: number; gid: number; work: string; home: string; socket: string; node: string; privateDirectory: string
}
export const ISOLATION_CONTEXT = '/run/oa-ci-isolation/context.json'

export function candidateExecution(): CandidateExecution {
  const metadata = lstatSync(ISOLATION_CONTEXT)
  if (!metadata.isFile() || metadata.uid !== 0 || metadata.mode & 0o022) throw new Error('Untrusted candidate execution context')
  const value: unknown = JSON.parse(readFileSync(ISOLATION_CONTEXT, 'utf8'))
  if (typeof value !== 'object' || value === null || !('uid' in value) || value.uid !== 61000
    || !('gid' in value) || value.gid !== 61000 || !('home' in value) || value.home !== '/home/oa-candidate'
    || !('work' in value) || value.work !== '/home/oa-candidate/work'
    || !('socket' in value) || value.socket !== '/run/user/61000/docker.sock'
    || !('node' in value) || typeof value.node !== 'string' || !value.node.startsWith('/opt/hostedtoolcache/node/')
    || !('privateDirectory' in value) || typeof value.privateDirectory !== 'string' || !value.privateDirectory.startsWith('/home/runner/work/_temp/')) {
    throw new Error('Invalid candidate execution context')
  }
  if (process.getuid?.() === value.uid) throw new Error('Candidate cannot act as the trusted scheduler')
  return { uid: value.uid, gid: value.gid, home: value.home, work: value.work, socket: value.socket, node: value.node, privateDirectory: value.privateDirectory }
}

const canonicalGit = (source: string, args: string[]): Buffer => execFileSync('git', [
  '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
  `--git-dir=${join(source, '.git')}`, ...args,
], { cwd: source, env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })

function noLinkParents(root: string, file: string): void {
  let parent = dirname(file)
  while (parent !== root) {
    if (!parent.startsWith(root + '/')) throw new Error('Path leaves candidate directory')
    if (!lstatSync(parent).isDirectory()) throw new Error('Candidate path contains a link')
    parent = dirname(parent)
  }
  if (!lstatSync(root).isDirectory()) throw new Error('Candidate directory is not a directory')
}

export function verifyCandidateSources(source: string, work: string, sha: string): void {
  fullSha(sha)
  for (const entry of canonicalGit(source, ['ls-tree', '-rz', '--full-tree', sha]).toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/.exec(entry)
    if (!match) throw new Error('Unsupported candidate source entry')
    const [, mode, expected, file] = match, path = join(work, file)
    noLinkParents(work, path)
    const metadata = lstatSync(path)
    let bytes: Buffer
    if (mode === '120000' && metadata.isSymbolicLink()) bytes = Buffer.from(readlinkSync(path))
    else {
      if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o111 ? '100755' : '100644') !== mode) throw new Error(`Changed candidate source: ${file}`)
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try { bytes = readFileSync(fd) } finally { closeSync(fd) }
    }
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (actual !== expected) throw new Error(`Changed candidate source: ${file}`)
  }
  const extra = canonicalGit(source, [`--work-tree=${work}`, 'ls-files', '--others', '--exclude-standard', '-z']).toString('utf8')
  if (extra) throw new Error(`Untracked candidate source: ${extra.split('\0')[0]}`)
}

export function collectCandidateDiagnostics(work: string, destination: string): void {
  let total = 0
  const visit = (relative: string): void => {
    const path = join(work, relative)
    let metadata
    try { noLinkParents(work, path); metadata = lstatSync(path) } catch { return }
    if (metadata.isDirectory()) { for (const entry of readdirSync(path)) visit(join(relative, entry)); return }
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16 * 1024 * 1024 || total + metadata.size > 128 * 1024 * 1024) return
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const opened = fstatSync(fd)
      if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== metadata.ino || opened.dev !== metadata.dev) return
      const target = join(destination, relative)
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
      writeFileSync(target, readFileSync(fd), { flag: 'wx', mode: 0o600 }); total += metadata.size
    } finally { closeSync(fd) }
  }
  visit('output/verification'); visit('output/playwright')
}

export function displayCandidateLog(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let bytes: Buffer
  try {
    const size = fstatSync(fd).size, length = Math.min(size, 16000)
    bytes = Buffer.alloc(length)
    readSync(fd, bytes, 0, length, size - length)
  } finally { closeSync(fd) }
  return escapeWorkflowCommands(bytes.toString('utf8'))
}

export function escapeWorkflowCommands(message: string): string {
  return message.replace(/::/g, '%3A%3A').replace(/##\[/g, '%23%23[').replace(/./gs, character => {
    const code = character.charCodeAt(0)
    return code < 32 && code !== 10 || code === 127 ? `%${code.toString(16).padStart(2, '0').toUpperCase()}` : character
  })
}

export function printVerificationOutput(message: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
  if (stream === 'stderr') console.error(escapeWorkflowCommands(message))
  else console.log(escapeWorkflowCommands(message))
}

export function candidateEnvironment(execution: CandidateExecution, environment: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: execution.home, USER: 'oa-candidate', LOGNAME: 'oa-candidate',
    PATH: `${dirname(execution.node)}:/usr/local/bin:/usr/bin:/bin`,
    XDG_RUNTIME_DIR: '/run/user/61000', DOCKER_HOST: `unix://${execution.socket}`,
    CI: 'true', GITHUB_ACTIONS: 'true', TERM: 'dumb', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    REPLAY_VIEWER_ROOT: join(execution.home, 'replay-viewers'),
    ...environment,
  }
}

export function executeCandidate(execution: CandidateExecution, command: string, args: string[], phase: string, environment: Record<string, string> = {}): number {
  if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Invalid candidate execution phase')
  const log = join(execution.privateDirectory, `${phase}.log`)
  const fd = openSync(log, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    const env = candidateEnvironment(execution, environment)
    const result = spawnSync('/usr/bin/sudo', ['-n', '/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
      `--unit=oa-candidate-${phase}`, `--slice=user-${execution.uid}.slice`, `--uid=${execution.uid}`, `--gid=${execution.gid}`,
      '--property=NoNewPrivileges=yes', '--property=SupplementaryGroups=', '--property=KillMode=control-group',
      `--working-directory=${execution.work}`, '/usr/bin/env', '-i', ...Object.entries(env).map(([key, value]) => `${key}=${value}`), command, ...args,
    ], { stdio: ['ignore', fd, fd] })
    if (result.error) throw result.error
    return result.status ?? 1
  } finally { closeSync(fd); printVerificationOutput(displayCandidateLog(log)) }
}

export function stopCandidateExecution(): void {
  printVerificationOutput(execFileSync('/usr/bin/sudo', ['-n', '/usr/bin/bash', join(import.meta.dirname, 'stop-candidate-isolation.sh'), String(process.getuid?.())], { encoding: 'utf8', stdio: 'pipe' }).trim())
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, source, sha] = process.argv.slice(2)
    const execution = candidateExecution()
    if (mode === 'finish' && source && sha) {
      stopCandidateExecution()
      try { verifyCandidateSources(resolve(source), execution.work, sha) }
      finally { collectCandidateDiagnostics(execution.work, execution.privateDirectory) }
    } else {
      const command = mode === 'smoke' ? execution.node : join(dirname(execution.node), 'pnpm')
      const args = mode === 'smoke' ? ['/run/oa-ci-isolation/smoke.mts']
        : mode === 'install' ? ['install', '--frozen-lockfile']
          : mode === 'browsers' ? ['exec', 'playwright', 'install', 'chromium', 'webkit', 'firefox'] : null
      if (!args) throw new Error('Usage: candidate-isolation.ts smoke|install|browsers|finish <source> <sha>')
      if (executeCandidate(execution, command, args, mode) !== 0) throw new Error(`Candidate ${mode} failed`)
    }
  } catch (error) { printVerificationOutput(error instanceof Error ? error.message : String(error), 'stderr'); process.exitCode = 1 }
}
