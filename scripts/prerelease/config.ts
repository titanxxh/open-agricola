import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, lstatSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { parseEnv } from 'node:util'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected target configuration object')
  return Object.fromEntries(Object.entries(value))
}
const string = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw new Error('Missing target configuration')
  return value
}
const match = (value: unknown, pattern: RegExp, message: string): string => {
  const result = string(value)
  if (!pattern.test(result)) throw new Error(message)
  return result
}
const absolute = (value: unknown): string => {
  const path = match(value, /^\/[a-zA-Z0-9_./-]+$/, 'Expected an absolute owner path without shell syntax')
  if (!isAbsolute(path) || resolve(path) !== path || path === '/') throw new Error('Expected a normalized owner directory')
  return path
}
const origin = (value: unknown): string => {
  const url = new URL(string(value))
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('Expected an exact HTTPS origin')
  return url.origin
}
const integer = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid prerelease resource budget')
  return value
}
const budget = (value: unknown) => {
  const limits = object(value)
  if (typeof limits.cpus !== 'number' || limits.cpus < 0.1 || limits.cpus > 32) throw new Error('Invalid prerelease CPU budget')
  return { memoryMiB: integer(limits.memoryMiB, 32, 131072), cpus: limits.cpus, pids: integer(limits.pids, 32, 65536) }
}
const overlaps = (left: string, right: string) => left === right || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`)

/** Parse identities before any network request, directory creation or container command. */
export function parsePrereleaseTarget(value: unknown) {
  const input = object(value)
  if (input.format !== 1 || input.channel !== 'prerelease') throw new Error('An explicit prerelease target is required')
  const targetId = match(input.targetId, /^prerelease-[a-z0-9-]+$/, 'Invalid prerelease target identity')
  const directory = absolute(input.directory), policyDirectory = absolute(input.policyDirectory)
  const project = string(input.project)
  if (project !== `open-agricola-${targetId}` || directory.split('/').at(-1) !== project) throw new Error('Target directory/project must identify the same prerelease environment')
  const formalInput = object(input.formal)
  const formal = { project: string(formalInput.project), directory: absolute(formalInput.directory),
    appOrigin: origin(formalInput.appOrigin), apiOrigin: origin(formalInput.apiOrigin), database: string(formalInput.database),
    bucket: string(formalInput.bucket), offsiteDirectory: absolute(formalInput.offsiteDirectory) }
  const targetOrigin = origin(input.origin)
  if ([formal.appOrigin, formal.apiOrigin].some(value => new URL(value).hostname === new URL(targetOrigin).hostname)) throw new Error('Prerelease must not receive formal host-only cookies')
  if (project === formal.project || overlaps(directory, formal.directory) || overlaps(directory, policyDirectory)) throw new Error('Prerelease and formal/policy directories must be disjoint')
  const db = object(input.database), validation = object(input.validationDatabase), storage = object(input.objects)
  const database = { host: match(db.host, /^[a-zA-Z0-9.-]+$/, 'Expected the sealed database host'), port: integer(db.port, 1, 65535), name: match(db.name, /^oa_prerelease_[a-z0-9_]+$/, 'Expected an isolated prerelease database'),
    appRole: match(db.appRole, /^oa_prerelease_[a-z0-9_]+$/, 'Expected a prerelease application role'),
    backupRole: match(db.backupRole, /^oa_prerelease_[a-z0-9_]+$/, 'Expected a prerelease backup role') }
  const validationDatabase = { host: match(validation.host, /^[a-zA-Z0-9.-]+$/, 'Expected the sealed validation host'), port: integer(validation.port, 1, 65535), name: match(validation.name, /^oa_prerelease_[a-z0-9_]+$/, 'Expected an isolated prerelease validation database'),
    role: match(validation.role, /^oa_prerelease_[a-z0-9_]+$/, 'Expected a prerelease validation role') }
  if (database.name === formal.database || validationDatabase.name === formal.database || database.name === validationDatabase.name
    || new Set([database.appRole, database.backupRole, validationDatabase.role]).size !== 3) throw new Error('Source, backup and validation database roles/targets must be separate')
  const endpoint = new URL(string(storage.endpoint))
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.origin !== storage.endpoint || endpoint.username || endpoint.password) throw new Error('Expected an exact sealed object endpoint')
  const objects = { endpoint: endpoint.origin, bucket: match(storage.bucket, /^oa-prerelease-[a-z0-9-]+$/, 'Expected an isolated prerelease bucket'),
    prefix: match(storage.prefix, /^[a-z0-9-]+\/$/, 'Expected a bounded application object prefix'),
    appKeyId: string(storage.appKeyId), backupKeyId: string(storage.backupKeyId) }
  if (objects.bucket === formal.bucket || objects.prefix.startsWith('test/') || objects.appKeyId === objects.backupKeyId) throw new Error('Application and backup object permissions must be separate')
  const offsiteInput = object(input.offsite)
  const offsite = { host: match(offsiteInput.host, /^[a-zA-Z0-9][a-zA-Z0-9@_.-]*$/, 'Invalid offsite SSH target'), directory: absolute(offsiteInput.directory) }
  if (overlaps(offsite.directory, formal.offsiteDirectory) || offsite.directory.split('/').at(-1) !== project) throw new Error('Offsite directory must belong exclusively to this prerelease target')
  const builderInput = object(input.builder), budgetsInput = object(input.budgets)
  const builder = { name: match(builderInput.name, /^prerelease-[a-z0-9-]+$/, 'Expected a prerelease builder'),
    container: match(builderInput.container, /^prerelease-[a-z0-9-]+$/, 'Expected an explicitly scoped builder container') }
  const budgets = { app: budget(budgetsInput.app), tools: budget(budgetsInput.tools), build: budget(budgetsInput.build),
    diskMiB: integer(budgetsInput.diskMiB, 256, 4_194_304), reserveMemoryMiB: integer(budgetsInput.reserveMemoryMiB, 128, 1_048_576) }
  return { format: 1, channel: 'prerelease', targetId, directory, policyDirectory, project, origin: targetOrigin,
    port: integer(input.port, 1024, 65535), network: match(input.network, /^open-agricola-prerelease-[a-z0-9-]+$/, 'Expected an exclusive prerelease dependency network'),
    database, validationDatabase, objects, offsite, builder, budgets, formal }
}

export type PrereleaseTarget = ReturnType<typeof parsePrereleaseTarget>
export const targetFingerprint = (target: PrereleaseTarget) => createHash('sha256').update(JSON.stringify(target)).digest('hex')

/** Existing ancestors and credential files may never redirect writes through symlinks. */
export function assertOwnerPath(path: string): void {
  let current = resolve(path)
  while (true) {
    try { if (lstatSync(current).isSymbolicLink() || realpathSync(current) !== current) throw new Error('Owner paths must not contain symlinks'); return }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    const parent = dirname(current)
    if (parent === current) throw new Error('Owner directory does not have a safe ancestor')
    current = parent
  }
}

/** Check every writable mount and existing descendant before creating state or invoking Docker/SSH. */
export function assertScopedPaths(target: PrereleaseTarget): void {
  for (const path of [target.directory, target.policyDirectory, join(target.directory, 'data'), ...['control', 'output', 'backups'].map(name => join(target.directory, name))]) assertOwnerPath(path)
  let entries = 0
  const scan = (path: string): void => {
    let children
    try { children = readdirSync(path, { withFileTypes: true }) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
    for (const child of children) {
      if (++entries > 100000) throw new Error('Prerelease writable tree exceeds the bounded scope inventory')
      if (child.isSymbolicLink() || !child.isDirectory() && !child.isFile()) throw new Error('Prerelease writable mounts contain an alias or special file')
      if (child.isDirectory()) scan(join(path, child.name))
    }
  }
  for (const name of ['control', 'output', 'backups']) scan(join(target.directory, name))
}

function connection(raw: string | undefined, database: { name: string; host: string; port: number }, role: string): void {
  if (!raw) throw new Error('Missing isolated database credentials')
  const url = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.pathname.slice(1)) !== database.name
    || decodeURIComponent(url.username) !== role || url.hostname !== database.host || Number(url.port || 5432) !== database.port
    || [...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'user', 'dbname', 'service', 'options'].includes(key))) throw new Error('Database credentials do not match the sealed prerelease target')
}

export function loadPrereleaseEnvironment(target: PrereleaseTarget) {
  assertScopedPaths(target)
  for (const path of [target.directory, join(target.directory, '.env'), join(target.directory, 'data/dependencies.compose.env')]) assertOwnerPath(path)
  if (existsSync(join(target.directory, 'data/local-services.env'))) throw new Error('Prerelease must not archive local bootstrap credentials')
  for (const path of [join(target.directory, '.env'), join(target.directory, 'data/dependencies.compose.env')]) {
    if (statSync(path).mode & 0o077) throw new Error('Prerelease credential files must be owner-private')
  }
  const app = parseEnv(readFileSync(join(target.directory, '.env'), 'utf8'))
  const tools = parseEnv(readFileSync(join(target.directory, 'data/dependencies.compose.env'), 'utf8'))
  connection(app.DATABASE_URL, target.database, target.database.appRole)
  connection(tools.DATABASE_URL, target.database, target.database.backupRole)
  connection(tools.VALIDATION_DATABASE_URL, target.validationDatabase, target.validationDatabase.role)
  const allowed = new Set(['DATABASE_URL', 'DATABASE_SCHEMA', 'VALIDATION_DATABASE_URL', 'S3_ENDPOINT', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'S3_BUCKET', 'S3_PREFIX', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'RELEASE_CHANNEL', 'PRERELEASE_IDENTITY_SERVICE_KEY'])
  for (const env of [app, tools]) {
    if (env.S3_BUCKET !== target.objects.bucket || env.S3_PREFIX !== target.objects.prefix || env.S3_ENDPOINT !== target.objects.endpoint || !env.S3_REGION || !env.S3_SECRET_ACCESS_KEY
      || (env.DATABASE_SCHEMA && env.DATABASE_SCHEMA !== 'public')
      || Object.keys(env).some(key => !allowed.has(key))) throw new Error('Prerelease environment contains missing, formal or unscoped permissions')
  }
  if (app.S3_ACCESS_KEY_ID !== target.objects.appKeyId || tools.S3_ACCESS_KEY_ID !== target.objects.backupKeyId
    || tools.PRERELEASE_IDENTITY_SERVICE_KEY || app.VALIDATION_DATABASE_URL || app.RELEASE_CHANNEL && app.RELEASE_CHANNEL !== 'prerelease') throw new Error('Application credentials must not contain backup or stable permissions')
  return { app, tools }
}
