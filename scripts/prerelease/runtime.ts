import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applicationDataEnvironment, assertOwnerPath, assertScopedPaths, type PrereleaseTarget, targetFingerprint } from './config'
import { candidateAlias } from './gateway'
import { HOSTED_APP_PATH } from '../../shared/contract/protocol/app-location'

export type InstalledBuild = { buildId: string; image: string; installedAt: number }
export type Operation = { id: string; kind: 'deploy' | 'reset' | 'restore' | 'reverify'; buildId: string; image: string;
  sourceBuildId: string | null; sourceImage: string | null; stage: 'backup' | 'migration' | 'startup' | 'acceptance'; backupStem: string | null; generation: string }
export type RuntimeRecord = {
  format: 1; channel: 'prerelease'; targetId: string; fingerprint: string; generation: string;
  mode: 'maintenance' | 'open' | 'closed'; buildId: string | null; installed: InstalledBuild | null;
  operation: Operation | null; acceptance: { acceptedAt: number; sha256: string; formalBuildId: string | null; healthyCycle: string | null } | null
}

export const controlDirectory = (target: PrereleaseTarget) => join(target.directory, 'control')
export const recordPath = (target: PrereleaseTarget) => join(controlDirectory(target), 'gate.json')
export const composePath = (target: PrereleaseTarget) => join(controlDirectory(target), 'compose.json')
export const gatewayAlias = (target: PrereleaseTarget) => `prerelease-${createHash('sha256').update(target.origin).digest('hex').slice(0, 32)}-gateway`
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)

export function atomicJson(path: string, value: unknown): void {
  assertOwnerPath(path)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx', flush: true })
  renameSync(temporary, path)
}

export function readRuntime(target: PrereleaseTarget): RuntimeRecord {
  let value: unknown
  try { value = JSON.parse(readFileSync(recordPath(target), 'utf8')) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { format: 1, channel: 'prerelease', targetId: target.targetId,
      fingerprint: targetFingerprint(target), generation: randomUUID(), mode: 'maintenance', buildId: null, installed: null, operation: null, acceptance: null }
    throw error
  }
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 1 || !('channel' in value) || value.channel !== 'prerelease'
    || !('targetId' in value) || value.targetId !== target.targetId || !('fingerprint' in value) || value.fingerprint !== targetFingerprint(target)
    || !('generation' in value) || !uuid(value.generation) || !('mode' in value) || !['maintenance', 'open', 'closed'].includes(String(value.mode))
    || !('buildId' in value) || value.buildId !== null && !sha(value.buildId) || !('installed' in value) || !('operation' in value) || !('acceptance' in value)) throw new Error('Runtime record does not match this sealed prerelease target')
  let installed: InstalledBuild | null = null
  if (value.installed !== null) {
    const row = value.installed
    if (!row || typeof row !== 'object' || !('buildId' in row) || !sha(row.buildId) || !('image' in row) || !digest(row.image)
      || !('installedAt' in row) || typeof row.installedAt !== 'number' || row.buildId !== value.buildId) throw new Error('Invalid installed prerelease build')
    installed = { buildId: row.buildId, image: row.image, installedAt: row.installedAt }
  }
  let operation: Operation | null = null
  if (value.operation !== null) {
    const row = value.operation
    if (!row || typeof row !== 'object' || !('id' in row) || !uuid(row.id) || !('kind' in row)
      || (row.kind !== 'deploy' && row.kind !== 'reset' && row.kind !== 'restore' && row.kind !== 'reverify') || !('buildId' in row) || !sha(row.buildId)
      || !('image' in row) || !digest(row.image) || !('sourceBuildId' in row) || row.sourceBuildId !== null && !sha(row.sourceBuildId)
      || !('stage' in row) || (row.stage !== 'backup' && row.stage !== 'migration' && row.stage !== 'startup' && row.stage !== 'acceptance')
      || !('backupStem' in row) || row.backupStem !== null && (typeof row.backupStem !== 'string' || !/^(daily|pre|manual)-[a-zA-Z0-9._-]+$/.test(row.backupStem))
      || !('generation' in row) || !uuid(row.generation) || row.generation !== value.generation) throw new Error('Invalid pending prerelease operation')
    const sourceImage = 'sourceImage' in row ? row.sourceImage : null
    if (sourceImage !== null && (!digest(sourceImage) || row.sourceBuildId === null)) throw new Error('Invalid pending source image')
    operation = { id: row.id, kind: row.kind, buildId: row.buildId, image: row.image, sourceBuildId: row.sourceBuildId,
      sourceImage, stage: row.stage, backupStem: row.backupStem, generation: row.generation }
  }
  let acceptance: RuntimeRecord['acceptance'] = null
  if (value.acceptance !== null) {
    const row = value.acceptance
    if (!row || typeof row !== 'object' || !('acceptedAt' in row) || typeof row.acceptedAt !== 'number'
      || !('sha256' in row) || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Invalid acceptance record')
    const formalBuildId = 'formalBuildId' in row ? row.formalBuildId : null
    if (formalBuildId !== null && !sha(formalBuildId)) throw new Error('Invalid accepted formal build')
    const healthyCycle = 'healthyCycle' in row && uuid(row.healthyCycle) ? row.healthyCycle : null
    acceptance = { acceptedAt: row.acceptedAt, sha256: row.sha256, formalBuildId, healthyCycle }
  }
  if (value.mode !== 'maintenance' && value.mode !== 'open' && value.mode !== 'closed') throw new Error('Invalid gateway mode')
  return { format: 1, channel: 'prerelease', targetId: target.targetId, fingerprint: value.fingerprint, generation: value.generation,
    mode: value.mode, buildId: value.buildId, installed, operation, acceptance }
}

export function renderCompose(target: PrereleaseTarget, record: RuntimeRecord, candidateImage?: string) {
  const labels = { 'org.open-agricola.environment': target.targetId, 'io.open-agricola.release-channel': 'prerelease' }
  const gatewayFiles = ['scripts/prerelease/gateway.ts', 'scripts/prerelease/storage-guard-state.ts', 'scripts/prerelease/browser-policy.ts', 'shared/contract/browser-auth.ts']
  const gatewayPolicy = createHash('sha256')
  for (const file of gatewayFiles) gatewayPolicy.update(file).update(readFileSync(join(target.policyDirectory, file)))
  const limits = (kind: 'app' | 'tools') => ({ mem_limit: `${target.budgets[kind].memoryMiB}m`, memswap_limit: `${target.budgets[kind].memoryMiB}m`, cpus: target.budgets[kind].cpus, pids_limit: target.budgets[kind].pids })
  const proxyNetwork = target.proxyNetwork ? { proxy: { external: true, name: target.proxyNetwork } } : {}
  const gateway = { image: 'node:24.19.0-slim', init: true, user: `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    read_only: true, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], mem_limit: '64m', memswap_limit: '64m', cpus: 0.25, pids_limit: 32,
    ports: [`127.0.0.1:${target.port}:5176`], labels: { ...labels, 'org.open-agricola.gateway-policy': gatewayPolicy.digest('hex') }, restart: 'unless-stopped',
    environment: { PRERELEASE_TARGET_ID: target.targetId, PRERELEASE_PUBLIC_ORIGIN: target.origin,
      FORMAL_APP_ORIGIN: target.formal.appOrigin, FORMAL_API_BASE: target.formal.apiOrigin },
    volumes: [`${controlDirectory(target)}:/control:ro`, ...gatewayFiles.map(file => `${join(target.policyDirectory, file)}:/policy/${file}:ro`)],
    command: ['node', '/policy/scripts/prerelease/gateway.ts'],
    networks: target.proxyNetwork ? { default: {}, proxy: { aliases: [gatewayAlias(target)] } } : ['default'] }
  const image = record.installed?.image ?? candidateImage
  if (!image) return { name: target.project, services: { gateway }, networks: { default: {}, ...proxyNetwork } }
  if (!digest(image) || candidateImage && !digest(candidateImage)) throw new Error('Compose requires immutable image digests')
  const app = { image, init: true, user: gateway.user, read_only: true, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'],
    ...limits('app'), env_file: [join(target.directory, '.env')], labels, restart: 'unless-stopped', stop_grace_period: '90s',
    tmpfs: ['/tmp:size=67108864'], volumes: [`${join(target.directory, 'output')}:/app/output`],
    networks: { default: { aliases: [candidateAlias(target.targetId)] }, dependencies: {} },
    environment: { RELEASE_CHANNEL: 'prerelease', NODE_ENV: 'production', APP_INSTANCES: '1', BACKEND_HOST: '0.0.0.0', BACKEND_PORT: '5175',
      APP_ROOM_CAPACITY: String(target.budgets.sessions.rooms), CUSTOM_SESSION_WORKER_CAPACITY: String(target.budgets.sessions.customWorkers),
      ALLOW_ANONYMOUS_WS: 'false', ACCOUNT_REGISTRATION_POLICY: 'invite_only', REPLAY_TRUST_PROXY: 'true',
      GAME_BUILD_ID: record.installed?.buildId ?? record.operation?.buildId, CORS_ORIGIN: target.origin,
      PUBLIC_APP_ORIGIN: `${target.origin}${HOSTED_APP_PATH}`, PUBLIC_API_BASE: target.origin, FORMAL_APP_ORIGIN: target.formal.appOrigin, FORMAL_API_BASE: target.formal.apiOrigin,
      PRERELEASE_TARGET_ID: target.targetId, PRERELEASE_DATA_GENERATION: record.generation } }
  const tool = { image: candidateImage ?? image, init: true, user: gateway.user, read_only: true, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'],
    ...limits('tools'), profiles: ['tools'], labels, networks: ['dependencies'], tmpfs: ['/tmp:size=67108864'],
    environment: { GAME_BUILD_ID: record.operation?.buildId ?? record.buildId, RELEASE_CHANNEL: 'prerelease' } }
  const appDataEnvironment = applicationDataEnvironment(target)
  return { name: target.project, services: { gateway, app, tools: { ...tool, env_file: [join(target.directory, 'data/dependencies.compose.env')] },
    migrate: { ...tool, environment: { ...appDataEnvironment, ...tool.environment } }, capture: { ...tool, image, environment: { ...appDataEnvironment, ...tool.environment } } },
  networks: { default: {}, dependencies: { external: true, name: target.network }, ...proxyNetwork } }
}

function maintenanceMessages(target: PrereleaseTarget) {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Prepare the pinned language packs before initialization')
    return Object.fromEntries(Object.entries(value))
  }
  const ref = object(JSON.parse(readFileSync(join(target.policyDirectory, 'i18n.ref'), 'utf8')))
  const raw = readFileSync(join(target.policyDirectory, 'public/i18n/manifest.json'))
  if (createHash('sha256').update(raw).digest('hex') !== ref.manifestSha256) throw new Error('Prepared language packs do not match the trusted policy pin')
  const manifest = object(JSON.parse(raw.toString('utf8')))
  if (!Array.isArray(manifest.languages)) throw new Error('Invalid language manifest')
  const locales: Record<string, { title: string; body: string; back: string }> = {}
  for (const locale of ['en', 'zh']) {
    const entry = manifest.languages.map(object).find(entry => entry.id === locale)
    if (!entry || typeof entry.file !== 'string' || !/^[a-z]{2}\.[a-f0-9]+\.json$/.test(entry.file)) throw new Error('Missing maintenance language pack')
    const bytes = readFileSync(join(target.policyDirectory, 'public/i18n', entry.file))
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Altered maintenance language pack')
    const messages = object(object(JSON.parse(bytes.toString('utf8'))).messages)
    const title = messages['prerelease.environment'], body = messages['prerelease.maintenance'], back = messages['prerelease.returnToProduction']
    if (typeof title !== 'string' || typeof body !== 'string' || typeof back !== 'string') throw new Error('Pinned pack lacks maintenance messages')
    locales[locale] = { title, body, back }
  }
  return { format: 1, formalOrigin: target.formal.appOrigin, locales }
}

export function writeRuntime(target: PrereleaseTarget, record: RuntimeRecord, candidateImage?: string): void {
  assertScopedPaths(target)
  if (record.installed || candidateImage) for (const name of ['output', 'backups']) mkdirSync(join(target.directory, name), { recursive: true, mode: 0o700 })
  atomicJson(join(controlDirectory(target), 'maintenance.json'), maintenanceMessages(target))
  atomicJson(recordPath(target), record)
  atomicJson(composePath(target), renderCompose(target, record, candidateImage))
}
