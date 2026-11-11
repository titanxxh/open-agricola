import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { freemem } from 'node:os'
import { existsSync, mkdirSync, statfsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { composePath, type RuntimeRecord } from './runtime'
import { targetFingerprint, type PrereleaseTarget } from './config'

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

export function assertCapacity(target: PrereleaseTarget): void {
  const fs = statfsSync(target.directory)
  const remaining = fs.bavail * fs.bsize
  const memory = target.budgets.app.memoryMiB + target.budgets.tools.memoryMiB + target.budgets.build.memoryMiB + target.budgets.reserveMemoryMiB
  if (freemem() < memory * 1024 * 1024 || remaining < target.budgets.diskMiB * 1024 * 1024) throw new Error('Measured host capacity is below the approved prerelease budget')
}

export function inspectImage(image: string, buildId: string): string {
  const digest = command('docker', ['image', 'inspect', '--format', '{{.Id}}', image])
  const labels = parsed(command('docker', ['image', 'inspect', '--format', '{{json .Config.Labels}}', digest]))
  if (!/^sha256:[a-f0-9]{64}$/.test(digest) || labels['org.opencontainers.image.revision'] !== buildId
    || labels['io.open-agricola.release-channel'] !== 'prerelease') throw new Error('Image channel/SHA does not match the fixed prerelease candidate')
  const metadata = parsed(command('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--memory', '64m', '--cpus', '0.25', '--pids-limit', '32', '--entrypoint', 'node', digest,
    '-e', 'process.stdout.write(require("node:fs").readFileSync("/app/frontend-dist/frontend-build.json","utf8"))']))
  if (metadata.format !== 1 || metadata.gameBuildId !== buildId || metadata.basePath !== '/open-agricola/'
    || metadata.releaseChannel !== 'prerelease' || metadata.deploymentTarget !== 'prerelease-hosted') throw new Error('Hosted frontend is not paired with the prerelease image')
  return digest
}

export function buildImage(target: PrereleaseTarget, buildId: string): string {
  assertCapacity(target)
  const builder = parsed(command('docker', ['buildx', 'inspect', target.builder.name, '--format', '{{json .}}']))
  const nodes = builder.Nodes
  if (builder.Driver !== 'remote' || !Array.isArray(nodes) || nodes.length !== 1 || object(nodes[0]).Endpoint !== `docker-container://${target.builder.container}`) throw new Error('Buildx must use the explicitly bounded prerelease BuildKit container')
  const labels = parsed(command('docker', ['inspect', '--format', '{{json .Config.Labels}}', target.builder.container]))
  const state = parsed(command('docker', ['inspect', '--format', '{{json .State}}', target.builder.container]))
  const config = parsed(command('docker', ['inspect', '--format', '{{json .Config}}', target.builder.container]))
  const mounts: unknown = JSON.parse(command('docker', ['inspect', '--format', '{{json .Mounts}}', target.builder.container]))
  const limits = parsed(command('docker', ['inspect', '--format', '{{json .HostConfig}}', target.builder.container]))
  const cpu = typeof limits.NanoCpus === 'number' && limits.NanoCpus > 0 ? limits.NanoCpus / 1e9
    : typeof limits.CpuQuota === 'number' && typeof limits.CpuPeriod === 'number' && limits.CpuPeriod > 0 ? limits.CpuQuota / limits.CpuPeriod : 0
  if (labels['org.open-agricola.environment'] !== target.targetId || state.Running !== true || typeof config.User !== 'string'
    || !/^1000(?::1000)?$/.test(config.User) || !Array.isArray(mounts) || mounts.some(value => object(value).Type !== 'volume' || object(value).Destination !== '/home/user/.local/share/buildkit')
    || limits.Privileged !== false || limits.PidMode === 'host' || limits.IpcMode === 'host' || limits.NetworkMode === 'host'
    || Array.isArray(limits.CapAdd) && limits.CapAdd.length > 0 || Array.isArray(limits.Devices) && limits.Devices.length > 0
    || typeof limits.Memory !== 'number' || limits.Memory <= 0 || limits.Memory > target.budgets.build.memoryMiB * 1024 * 1024
    || !cpu || cpu > target.budgets.build.cpus || typeof limits.PidsLimit !== 'number' || limits.PidsLimit <= 0 || limits.PidsLimit > target.budgets.build.pids) throw new Error('Prerelease builder limits or ownership are missing')
  const archive = execFileSync('git', ['archive', '--format=tar', buildId], { cwd: target.policyDirectory, maxBuffer: 256 * 1024 * 1024 })
  const tag = `${target.project}:${buildId}`
  command('docker', ['buildx', 'build', '--builder', target.builder.name, '--load', '--build-arg', `GAME_BUILD_ID=${buildId}`,
    '--build-arg', 'RELEASE_CHANNEL=prerelease', '--tag', tag, '-'], { input: archive, cwd: target.directory, timeout: 30 * 60 * 1000 })
  return inspectImage(tag, buildId)
}

export function stopWriters(target: PrereleaseTarget, record: RuntimeRecord): void {
  if (!record.installed) return
  const container = compose(target, ['ps', '-a', '-q', 'app'])
  const unacceptedStartup = record.operation?.stage === 'startup' && record.operation.buildId === record.installed.buildId && !record.acceptance
  if (!container && unacceptedStartup) return
  if (!/^[a-f0-9]+$/.test(container)) throw new Error('Cannot identify exactly one prerelease application writer')
  if (command('docker', ['inspect', '--format', '{{.Image}}', container]) !== record.installed.image
    || command('docker', ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', container]) !== target.project) throw new Error('Running application differs from the expected deployment')
  const before = parsed(command('docker', ['inspect', '--format', '{{json .State}}', container]))
  compose(target, ['stop', '--timeout', '90', 'app'])
  const status = parsed(command('docker', ['inspect', '--format', '{{json .State}}', container]))
  if (status.Running !== false || status.OOMKilled !== false || status.ExitCode !== 0 && !(unacceptedStartup && before.Running === false)) throw new Error('Application did not drain cleanly; keep maintenance and inspect accepted commits')
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

function boundedTool(target: PrereleaseTarget, run: (labels: string[], deadline: number) => string): string {
  const id = randomUUID(), deadline = Date.now() + 1790_000
  const labels = ['--label', `org.open-agricola.backup.environment=${target.targetId}`, '--label', `org.open-agricola.backup.run=${id}`,
    '--label', `org.open-agricola.backup.deadline=${deadline}`]
  try { return run(labels, deadline) }
  finally { cleanupOwnedTools(target, id) }
}

export function candidateTool(target: PrereleaseTarget, service: 'capture' | 'tools' | 'migrate', args: string[], extra: string[] = []): string {
  return boundedTool(target, (labels, deadline) => compose(target, ['run', '--rm', '--no-deps', '-T', ...labels, ...extra,
    '-e', `BACKUP_DEADLINE_EPOCH_MS=${deadline}`, service, 'timeout', '--signal=TERM', '--kill-after=3s', '1790',
    'node', '--import', 'tsx', ...args], 1800_000))
}

export function archiveTool(target: PrereleaseTarget, service: 'capture' | 'tools' | 'migrate', args: string[], extra: string[] = []): string {
  return candidateTool(target, service, ['scripts/storage-archive-cli.ts', ...args], extra)
}

export const backupRoot = (target: PrereleaseTarget) => join(target.directory, 'backups')

export function policyTool(target: PrereleaseTarget, operation: 'inspect' | 'empty' | 'reset' | 'budget' | 'identities', extra: Record<string, string> = {}, credentials: 'app' | 'tools' = 'app'): string {
  const policySha = command('git', ['rev-parse', 'HEAD'], { cwd: target.policyDirectory })
  if (!/^[a-f0-9]{40}$/.test(policySha)) throw new Error('Trusted main policy SHA is missing')
  const code = join(target.directory, 'control', `policy-${policySha}`)
  if (!existsSync(code)) {
    mkdirSync(code, { recursive: true, mode: 0o700 })
    const archive = execFileSync('git', ['archive', '--format=tar', policySha], { cwd: target.policyDirectory, maxBuffer: 256 * 1024 * 1024 })
    command('tar', ['--exclude=CLAUDE.md', '-xf', '-', '-C', code], { input: archive })
  }
  const config = join(target.directory, 'control', 'target.json')
  writeFileSync(config, JSON.stringify(target), { mode: 0o600 })
  const env: string[] = []
  for (const [key, value] of Object.entries(extra)) env.push('-e', `${key}=${value}`)
  return boundedTool(target, (labels) => command('docker', ['run', '--rm', ...labels, '--network', target.network, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, '--memory', `${target.budgets.tools.memoryMiB}m`, '--cpus', String(target.budgets.tools.cpus),
    '--pids-limit', String(target.budgets.tools.pids), '--tmpfs', '/tmp:size=67108864',
    '--env-file', join(target.directory, credentials === 'app' ? '.env' : 'data/dependencies.compose.env'), '-e', 'RELEASE_CHANNEL=prerelease', ...env,
    '-v', `${code}:/policy:ro`, '-v', `${join(target.policyDirectory, 'node_modules')}:/policy/node_modules:ro`, '-v', `${config}:/target.json:ro`,
    '-v', `${backupRoot(target)}:/backup`, '--workdir', '/policy', '--entrypoint', 'timeout', 'node:24.19.0-slim', '--signal=TERM', '--kill-after=3s', '1790', 'node', '--import', 'tsx', 'scripts/prerelease/storage.ts', operation],
  { timeout: 1800_000 }))
}

export function verifyPermissions(target: PrereleaseTarget): void {
  policyTool(target, 'inspect')
  policyTool(target, 'inspect', {}, 'tools')
}
