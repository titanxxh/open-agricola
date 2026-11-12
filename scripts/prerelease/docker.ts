import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { freemem } from 'node:os'
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { atomicJson, composePath, controlDirectory, readRuntime, type RuntimeRecord } from './runtime'
import { applicationDataEnvironment, assertOwnerPath, targetFingerprint, type PrereleaseTarget } from './config'

export function command(program: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string | Buffer; timeout?: number } = {}): string {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'LANG', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'SSH_AUTH_SOCK']) if (process.env[key]) env[key] = process.env[key]
  Object.assign(env, options.env)
  try { return execFileSync(program, args, { ...options, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    timeout: options.timeout ?? 30_000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() }
  catch { throw new Error(`Prerelease ${program} ${args[0] ?? ''} failed; the gateway remains in its recorded mode`) }
}

export function compose(target: PrereleaseTarget, args: string[], timeout = 120_000): string {
  return command('docker', ['compose', '-f', composePath(target), '-p', target.project, ...args], { cwd: target.directory, timeout })
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Docker identity')
  return Object.fromEntries(Object.entries(value))
}
const parsed = (text: string): Record<string, unknown> => object(JSON.parse(text))

export function assertCapacity(target: PrereleaseTarget, phase: 'build' | 'tool' | 'inspect-image' | 'app' | 'idle'): void {
  command('bash', ['-euo', 'pipefail', '-c', 'source "$1"; backup_reap_tools', 'prerelease-reap', join(target.policyDirectory, 'scripts/backup-process.sh')],
    { env: { BACKUP_ENVIRONMENT: target.targetId, BACKUP_DEADLINE_EPOCH_MS: String(Date.now() + 30_000) } })
  if (command('docker', ['ps', '-q', '--filter', `name=^/${target.builder.container}$`])
    || command('docker', ['ps', '-q', '--filter', `label=org.open-agricola.backup.environment=${target.targetId}`])) {
    throw new Error(`Prerelease ${phase} requires its builder and other tools to be stopped`)
  }
  const appId = command('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${target.project}`, '--filter', 'label=com.docker.compose.service=app'])
  if (appId) {
    if (!/^[a-f0-9]{12,64}$/.test(appId)) throw new Error('Cannot identify one running prerelease application')
    const app = parsed(command('docker', ['inspect', '--format', '{{json .}}', appId]))
    const labels = object(object(app.Config).Labels), limits = object(app.HostConfig), record = readRuntime(target)
    const images = [record.installed?.image, record.operation?.image, record.operation?.sourceImage]
    if (labels['com.docker.compose.project'] !== target.project || labels['com.docker.compose.service'] !== 'app'
      || object(app.State).Running !== true || typeof app.Image !== 'string' || !images.includes(app.Image)
      || typeof limits.Memory !== 'number' || limits.Memory <= 0 || limits.Memory > target.budgets.app.memoryMiB * 1024 * 1024) {
      throw new Error('Running prerelease application identity or memory limit differs from the target')
    }
  }
  const phaseMemory = phase === 'build' ? target.budgets.build.memoryMiB : phase === 'tool' ? target.budgets.tools.memoryMiB : phase === 'inspect-image' ? 64 : 0
  const memory = 64 + (appId || phase === 'app' ? target.budgets.app.memoryMiB : 0) + phaseMemory + target.budgets.reserveMemoryMiB
  const fs = statfsSync(target.directory), remaining = fs.bavail * fs.bsize, available = freemem()
  if (available < memory * 1024 * 1024 || remaining < target.budgets.diskMiB * 1024 * 1024) {
    throw new Error(`Prerelease ${phase} capacity is below the conservative budget: available memory ${available}, required ${memory * 1024 * 1024}, disk ${remaining}`)
  }
}

function inspectFixedImage(target: PrereleaseTarget, image: string, buildId: string, channel: 'stable' | 'prerelease'): string {
  const digest = command('docker', ['image', 'inspect', '--format', '{{.Id}}', image])
  const labels = parsed(command('docker', ['image', 'inspect', '--format', '{{json .Config.Labels}}', digest]))
  if (!/^sha256:[a-f0-9]{64}$/.test(digest) || labels['org.opencontainers.image.revision'] !== buildId
    || labels['io.open-agricola.release-channel'] !== channel) throw new Error('Image channel/SHA does not match the fixed tool or candidate')
  assertCapacity(target, 'inspect-image')
  const metadata = parsed(command('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--memory', '64m', '--cpus', '0.25', '--pids-limit', '32', '--entrypoint', 'node', digest,
    '-e', 'process.stdout.write(require("node:fs").readFileSync("/app/frontend-dist/frontend-build.json","utf8"))']))
  if (metadata.format !== 1 || metadata.gameBuildId !== buildId || metadata.basePath !== '/open-agricola/'
    || metadata.releaseChannel !== channel || metadata.deploymentTarget !== `${channel}-hosted`) throw new Error('Hosted frontend is not paired with the fixed image')
  return digest
}

export const inspectImage = (target: PrereleaseTarget, image: string, buildId: string): string => inspectFixedImage(target, image, buildId, 'prerelease')

function stopBuilder(target: PrereleaseTarget): void {
  command('docker', ['stop', '--timeout', '30', target.builder.container], { timeout: 40_000 })
  if (parsed(command('docker', ['inspect', '--format', '{{json .State}}', target.builder.container])).Running !== false) throw new Error('Prerelease builder did not stop; do not start another phase')
}

function buildFixedImage(target: PrereleaseTarget, buildId: string, channel: 'stable' | 'prerelease', deadlineEpochMs?: number): string {
  const builders = [...new Set(command('docker', ['buildx', 'ls', '--format', '{{json .Builder}}']).split('\n').filter(Boolean)
    .map(line => JSON.stringify(parsed(line))))].map(parsed).filter(builder => builder.Name === target.builder.name)
  const builder = builders[0]
  const nodes = builder?.Nodes
  if (builders.length !== 1 || builder?.Driver !== 'remote' || !Array.isArray(nodes) || nodes.length !== 1 || object(nodes[0]).Endpoint !== `docker-container://${target.builder.container}`) throw new Error('Buildx must use the explicitly bounded prerelease BuildKit container')
  const labels = parsed(command('docker', ['inspect', '--format', '{{json .Config.Labels}}', target.builder.container]))
  const state = parsed(command('docker', ['inspect', '--format', '{{json .State}}', target.builder.container]))
  const config = parsed(command('docker', ['inspect', '--format', '{{json .Config}}', target.builder.container]))
  const mounts: unknown = JSON.parse(command('docker', ['inspect', '--format', '{{json .Mounts}}', target.builder.container]))
  const limits = parsed(command('docker', ['inspect', '--format', '{{json .HostConfig}}', target.builder.container]))
  const cpu = typeof limits.NanoCpus === 'number' && limits.NanoCpus > 0 ? limits.NanoCpus / 1e9
    : typeof limits.CpuQuota === 'number' && typeof limits.CpuPeriod === 'number' && limits.CpuPeriod > 0 ? limits.CpuQuota / limits.CpuPeriod : 0
  if (labels['org.open-agricola.environment'] !== target.targetId || state.Running !== false || typeof config.User !== 'string'
    || !/^1000(?::1000)?$/.test(config.User) || !Array.isArray(mounts) || mounts.some(value => object(value).Type !== 'volume' || object(value).Destination !== '/home/user/.local/share/buildkit')
    || limits.Privileged !== false || limits.PidMode === 'host' || limits.IpcMode === 'host' || limits.NetworkMode === 'host'
    || Array.isArray(limits.CapAdd) && limits.CapAdd.length > 0 || Array.isArray(limits.Devices) && limits.Devices.length > 0
    || typeof limits.Memory !== 'number' || limits.Memory <= 0 || limits.Memory > target.budgets.build.memoryMiB * 1024 * 1024
    || !cpu || cpu > target.budgets.build.cpus || typeof limits.PidsLimit !== 'number' || limits.PidsLimit <= 0 || limits.PidsLimit > target.budgets.build.pids) throw new Error('Prerelease builder limits or ownership are missing')
  assertCapacity(target, 'build')
  const tag = `${target.project}${channel === 'stable' ? '-policy' : ''}:${buildId}`
  try {
    command('docker', ['start', target.builder.container])
    if (parsed(command('docker', ['inspect', '--format', '{{json .State}}', target.builder.container])).Running !== true) throw new Error('Prerelease builder did not start')
    const archive = execFileSync('git', ['archive', '--format=tar', buildId], { cwd: target.policyDirectory, maxBuffer: 256 * 1024 * 1024 })
    command('docker', ['buildx', 'build', '--builder', target.builder.name, '--load', '--build-arg', `GAME_BUILD_ID=${buildId}`,
      '--build-arg', `RELEASE_CHANNEL=${channel}`, '--tag', tag, '-'], { input: archive, cwd: target.directory,
      timeout: deadlineEpochMs === undefined ? 30 * 60 * 1000 : Math.max(1, deadlineEpochMs - Date.now()) })
  } finally {
    stopBuilder(target)
  }
  return inspectFixedImage(target, tag, buildId, channel)
}

export const buildImage = (target: PrereleaseTarget, buildId: string): string => buildFixedImage(target, buildId, 'prerelease')

function trustedArchiveImage(target: PrereleaseTarget, deadlineEpochMs: number): string {
  const policySha = command('git', ['rev-parse', 'HEAD'], { cwd: target.policyDirectory })
  if (!/^[a-f0-9]{40}$/.test(policySha)) throw new Error('Trusted main policy SHA is missing')
  const path = join(controlDirectory(target), `archive-policy-${policySha}.json`)
  if (existsSync(path)) {
    const cached = parsed(readFileSync(path, 'utf8'))
    if (cached.policySha !== policySha || typeof cached.image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(cached.image)) throw new Error('Trusted archive image binding changed')
    return inspectFixedImage(target, cached.image, policySha, 'stable')
  }
  const image = buildFixedImage(target, policySha, 'stable', deadlineEpochMs)
  atomicJson(path, { policySha, image })
  return image
}

export function stopWriters(target: PrereleaseTarget, record: RuntimeRecord): void {
  if (!record.installed) return
  const container = compose(target, ['ps', '-a', '-q', 'app'])
  const unacceptedStartup = record.operation?.stage === 'startup' && record.operation.buildId === record.installed.buildId && !record.acceptance
  if (!container && unacceptedStartup) return
  if (!/^[a-f0-9]+$/.test(container)) throw new Error('Cannot identify exactly one prerelease application writer')
  const image = command('docker', ['inspect', '--format', '{{.Image}}', container])
  const drainedSource = image !== record.installed.image && unacceptedStartup && record.operation?.kind === 'deploy' && image === record.operation.sourceImage
  if (image !== record.installed.image && !drainedSource
    || command('docker', ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', container]) !== target.project) throw new Error('Running application differs from the expected deployment')
  const before = parsed(command('docker', ['inspect', '--format', '{{json .State}}', container]))
  if (drainedSource && (before.Running !== false || before.OOMKilled !== false || before.ExitCode !== 0)) throw new Error('Recorded source application is not cleanly stopped')
  compose(target, ['stop', '--timeout', '90', 'app'])
  const status = parsed(command('docker', ['inspect', '--format', '{{json .State}}', container]))
  if (status.Running !== false || status.OOMKilled !== false || status.ExitCode !== 0 && !(unacceptedStartup && !drainedSource && before.Running === false)) throw new Error('Application did not drain cleanly; keep maintenance and inspect accepted commits')
}

export function verifyRunning(target: PrereleaseTarget, record: RuntimeRecord): void {
  if (!record.installed) throw new Error('No installed prerelease build')
  const container = compose(target, ['ps', '-a', '-q', 'app'])
  if (!/^[a-f0-9]+$/.test(container) || command('docker', ['inspect', '--format', '{{.Image}}', container]) !== record.installed.image
    || command('docker', ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', container]) !== target.project) throw new Error('Live candidate image/project differs from the runtime record')
  const expected = JSON.stringify({ buildId: record.installed.buildId, generation: record.generation, origin: target.origin })
  const result = parsed(compose(target, ['exec', '-T', 'app', 'node', '--input-type=module', '-e', `
    const expected=${expected};
    const [health,location,build]=await Promise.all(["/api/health","/api/app-location","/open-agricola/frontend-build.json"].map(async path=>{
      const response=await fetch("http://127.0.0.1:5175"+path,{headers:{host:new URL(expected.origin).host,"x-forwarded-proto":"https"}});
      if(!response.ok)throw Error("Prerelease startup check failed");return response.json();
    }));
    if(health.ok!==true||location.buildId!==expected.buildId||build.gameBuildId!==expected.buildId||build.releaseChannel!=="prerelease"||build.deploymentTarget!=="prerelease-hosted"||process.env.PRERELEASE_DATA_GENERATION!==expected.generation)throw Error("Prerelease identity mismatch");
    process.stdout.write(JSON.stringify({buildId:build.gameBuildId,channel:build.releaseChannel,generation:expected.generation}));`]))
  if (result.buildId !== record.installed.buildId || result.channel !== 'prerelease' || result.generation !== record.generation) throw new Error('Installed prerelease identity did not verify')
}

export function backupEnvironment(target: PrereleaseTarget, record: RuntimeRecord): NodeJS.ProcessEnv {
  return { BACKUP_ENVIRONMENT: target.targetId, BACKUP_WORKING_DIRECTORY: target.directory, BACKUP_POLICY_ROOT: target.policyDirectory,
    BACKUP_TARGET_CONFIG: JSON.stringify(target), BACKUP_TARGET_BUILD_ID: record.operation?.buildId ?? record.buildId ?? '',
    BACKUP_COMPOSE_FILE: composePath(target), BACKUP_COMPOSE_PROJECT: target.project, BACKUP_TOOL_SERVICE: 'tools', BACKUP_CAPTURE_SERVICE: 'capture',
    BACKUP_TOOL_MEMORY_MIB: String(target.budgets.tools.memoryMiB), BACKUP_TOOL_CPUS: String(target.budgets.tools.cpus), BACKUP_TOOL_PIDS: String(target.budgets.tools.pids),
    BACKUP_RETENTION_DAYS: '7', BACKUP_DAILY_COUNT: '7', BACKUP_PRE_COUNT: '1000000', SOURCE_BUILD_ID: record.buildId ?? '',
    BACKUP_DATA_GENERATION: record.generation, BACKUP_TARGET_FINGERPRINT: targetFingerprint(target),
    BACKUP_SOURCE_IMAGE: record.installed?.image ?? '', OFFSITE_BACKUP_TARGET: target.offsite.host, OFFSITE_BACKUP_REMOTE_DIR: target.offsite.directory }
}

function cleanupOwnedTools(target: PrereleaseTarget, runId: string): void {
  const ids = command('docker', ['ps', '-aq', '--filter', `label=org.open-agricola.backup.environment=${target.targetId}`,
    '--filter', `label=org.open-agricola.backup.run=${runId}`]).split(/\s+/).filter(Boolean)
  if (ids.some(id => !/^[a-f0-9]+$/.test(id))) throw new Error('Invalid scoped tool cleanup inventory')
  if (ids.length) command('docker', ['rm', '-f', ...ids])
}

export type ToolBudget = { runId: string; deadlineEpochMs: number }

function boundedTool(target: PrereleaseTarget, run: (labels: string[], deadline: number, runId: string) => string, budget?: ToolBudget): string {
  const id = budget?.runId ?? randomUUID(), deadline = budget?.deadlineEpochMs ?? Date.now() + 1790_000
  if (!/^[a-zA-Z0-9-]+$/.test(id) || !Number.isSafeInteger(deadline) || deadline <= Date.now() || deadline - Date.now() > 1800_000) throw new Error('Invalid archive tool budget')
  const labels = ['--label', `org.open-agricola.backup.environment=${target.targetId}`, '--label', `org.open-agricola.backup.run=${id}`,
    '--label', `org.open-agricola.backup.deadline=${deadline}`]
  try { return run(labels, deadline, id) }
  finally { cleanupOwnedTools(target, id) }
}

type CandidateToolOptions = { inputs?: readonly { source: string; destination: string }[]; scratch?: string; budget?: ToolBudget; environment?: Readonly<Record<string, string>> }

export function candidateTool(target: PrereleaseTarget, service: 'tools' | 'migrate', args: string[], options: CandidateToolOptions = {}): string {
  const mounts: string[] = []
  for (const input of options.inputs ?? []) {
    if (!resolve(input.source).startsWith(backupRoot(target) + sep) || !/^\/backup\/[a-zA-Z0-9._/-]+$/.test(input.destination)
      || input.destination.split('/').includes('..')) throw new Error('Candidate input is outside the selected backup')
    assertOwnerPath(input.source)
    mounts.push('-v', `${input.source}:${input.destination}:ro`)
  }
  if (options.scratch) {
    if (!resolve(options.scratch).startsWith(backupRoot(target) + sep + '.backup-scratch-runs-')) throw new Error('Candidate scratch is outside its private run')
    assertOwnerPath(options.scratch)
    mkdirSync(options.scratch, { recursive: true, mode: 0o700 })
    mounts.push('-v', `${options.scratch}:/scratch`, '-e', 'BACKUP_SCRATCH_DIRECTORY=/scratch')
  }
  const environment: string[] = []
  for (const [key, value] of Object.entries(options.environment ?? {})) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error('Invalid candidate environment key')
    environment.push('-e', `${key}=${value}`)
  }
  assertCapacity(target, 'tool')
  return boundedTool(target, (labels, deadline, runId) => compose(target, ['run', '--rm', '--no-deps', '-T', ...labels, ...mounts, ...environment,
    '-e', `BACKUP_DEADLINE_EPOCH_MS=${deadline}`, '-e', `BACKUP_JOB_ID=${runId}`, '-e', `BACKUP_ENVIRONMENT=${target.targetId}`, '-e', 'PG_CLIENT_MODE=local', service,
    'timeout', '--signal=TERM', '--kill-after=3s', String(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))),
    'node', '--import', 'tsx', ...args], Math.max(1, deadline - Date.now()) + 3000), options.budget)
}

export function trustedArchiveTool(target: PrereleaseTarget, service: 'capture' | 'tools' | 'migrate', args: string[], budget?: ToolBudget): string {
  if (!['export', 'export-online', 'ledger-export', 'ledger-merge', 'cleanup-scratch'].includes(args[0] ?? '')) throw new Error('Unknown trusted archive operation')
  const record = readRuntime(target)
  return boundedTool(target, (labels, deadline, runId) => {
    const image = trustedArchiveImage(target, deadline)
    const dataEnvironment = service === 'tools' ? {} : applicationDataEnvironment(target)
    const credentials = service === 'tools' ? ['--env-file', join(target.directory, 'data/dependencies.compose.env')]
      : Object.keys(dataEnvironment).flatMap(key => ['-e', key])
    if (deadline <= Date.now()) throw new Error('Trusted archive image preparation exhausted the backup deadline')
    assertCapacity(target, 'tool')
    return command('docker', ['run', '--rm', ...labels, '--network', target.network,
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    '--memory', `${target.budgets.tools.memoryMiB}m`, '--cpus', String(target.budgets.tools.cpus), '--pids-limit', String(target.budgets.tools.pids),
    '--tmpfs', '/tmp:size=67108864', ...credentials,
    '-e', 'PG_CLIENT_MODE=local', '-e', 'RELEASE_CHANNEL=prerelease', '-e', `SOURCE_BUILD_ID=${record.installed?.buildId ?? ''}`,
    '-e', `BACKUP_ENVIRONMENT=${target.targetId}`, '-e', `BACKUP_JOB_ID=${runId}`,
    '-e', `BACKUP_DEADLINE_EPOCH_MS=${deadline}`, '-e', 'BACKUP_SCRATCH_DIRECTORY=/backup',
    '-v', `${backupRoot(target)}:/backup`, '--entrypoint', 'timeout', image, '--signal=TERM', '--kill-after=3s',
    String(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))), 'node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', ...args],
  { cwd: target.directory, env: dataEnvironment, timeout: Math.max(1, deadline - Date.now()) + 3000 })
  }, budget)
}

export function archiveTool(target: PrereleaseTarget, service: 'capture' | 'tools' | 'migrate', args: string[], environment: Readonly<Record<string, string>> = {}, budget?: ToolBudget): string {
  if (['ledger-export', 'ledger-merge', 'cleanup-scratch', 'export', 'export-online'].includes(args[0] ?? '')) return trustedArchiveTool(target, service, args, budget)
  if (service === 'capture') throw new Error('Candidate capture is not permitted')
  const inputs: { source: string; destination: string }[] = []
  if (args[0] === 'validate' || args[0] === 'restore') {
    const path = args[1]
    if (!path?.startsWith('/backup/') || path.split('/').includes('..')) throw new Error('Expected a selected archive input')
    inputs.push({ source: join(backupRoot(target), path.slice('/backup/'.length)), destination: path })
    if (args[0] === 'restore') inputs.push({ source: join(backupRoot(target), 'replay-removals.latest.json'), destination: '/backup/replay-removals.latest.json' })
  }
  return candidateTool(target, service, ['scripts/storage-archive-cli.ts', ...args], { inputs, budget, environment,
    ...(args[0] === 'validate' ? { scratch: join(backupRoot(target), `.backup-scratch-runs-${budget?.runId ?? randomUUID()}`) } : {}) })
}

export const backupRoot = (target: PrereleaseTarget) => join(target.directory, 'backups')

export function policyTool(target: PrereleaseTarget, operation: 'inspect' | 'empty' | 'reset' | 'budget' | 'identities', extra: Record<string, string> = {}, credentials: 'app' | 'tools' = 'app'): string {
  assertCapacity(target, 'tool')
  const policySha = command('git', ['rev-parse', 'HEAD'], { cwd: target.policyDirectory })
  if (!/^[a-f0-9]{40}$/.test(policySha)) throw new Error('Trusted main policy SHA is missing')
  const code = join(target.directory, 'control', `policy-${policySha}`)
  if (!existsSync(code)) {
    mkdirSync(code, { recursive: true, mode: 0o700 })
    const archive = execFileSync('git', ['archive', '--format=tar', policySha], { cwd: target.policyDirectory, maxBuffer: 256 * 1024 * 1024 })
    command('tar', ['--exclude=CLAUDE.md', '-xf', '-', '-C', code], { input: archive })
  }
  mkdirSync(join(code, 'node_modules'), { recursive: true, mode: 0o700 })
  const config = join(target.directory, 'control', 'target.json')
  writeFileSync(config, JSON.stringify(target), { mode: 0o600 })
  const env: string[] = []
  for (const [key, value] of Object.entries(extra)) env.push('-e', `${key}=${value}`)
  const dataEnvironment = credentials === 'app' ? applicationDataEnvironment(target) : {}
  const credentialArguments = credentials === 'tools' ? ['--env-file', join(target.directory, 'data/dependencies.compose.env')]
    : Object.keys(dataEnvironment).flatMap(key => ['-e', key])
  return boundedTool(target, (labels) => command('docker', ['run', '--rm', ...labels, '--network', target.network, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, '--memory', `${target.budgets.tools.memoryMiB}m`, '--cpus', String(target.budgets.tools.cpus),
    '--pids-limit', String(target.budgets.tools.pids), '--tmpfs', '/tmp:size=67108864',
    ...credentialArguments, '-e', 'RELEASE_CHANNEL=prerelease', ...env,
    '-v', `${code}:/policy:ro`, '-v', `${join(target.policyDirectory, 'node_modules')}:/policy/node_modules:ro`, '-v', `${config}:/target.json:ro`,
    '-v', `${backupRoot(target)}:/backup`, '--workdir', '/policy', '--entrypoint', 'timeout', 'node:24.19.0-slim', '--signal=TERM', '--kill-after=3s', '1790', 'node', '--import', 'tsx', 'scripts/prerelease/storage.ts', operation],
  { env: dataEnvironment, timeout: 1800_000 }))
}

export function verifyPermissions(target: PrereleaseTarget): void {
  policyTool(target, 'inspect')
  policyTool(target, 'inspect', {}, 'tools')
}
