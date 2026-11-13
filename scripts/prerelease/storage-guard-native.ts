import { createHash, createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, statfsSync, statSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { parseEnv } from 'node:util'
import { GetBucketVersioningCommand, ListMultipartUploadsCommand, ListObjectsV2Command, ListPartsCommand, S3Client } from '@aws-sdk/client-s3'
import { assertOwnerPath, targetFingerprint, type PrereleaseTarget } from './config'
import { stopStorageOperation } from './storage-operation'
import type { StorageGuardNative, StorageGuardLimits } from './storage-guard'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid storage guard configuration or native response')
  return Object.fromEntries(Object.entries(value))
}
const text = (value: unknown, pattern: RegExp): string => {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Invalid storage guard configuration')
  return value
}
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid storage guard configuration: measured positive limits required')
  return value
}
const bytes = (value: unknown): number => {
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0) throw new Error('Invalid native storage measurement')
  return result
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
// Match provisioning hashes: sort policy arrays and omit null/undefined object fields.
const normalizedPolicy = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizedPolicy).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== null && entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, normalizedPolicy(entry)]))
  return value
}
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

export function parseStorageGuardConfig(target: PrereleaseTarget, input: unknown) {
  const value = object(input)
  if (value.format !== 1 || value.fingerprint !== targetFingerprint(target)) throw new Error('Storage guard configuration must bind the exact target')
  const privatePath = (input: unknown) => {
    const path = text(input, /^\/[a-zA-Z0-9_./-]+$/)
    if (resolve(path) !== path || path === target.directory || path.startsWith(target.directory + sep)) throw new Error('Owner guard credentials must stay outside candidate paths')
    assertOwnerPath(path)
    return path
  }
  const limits = object(value.limits)
  const parsed: StorageGuardLimits = {
    sourceDatabaseBytes: number(limits.sourceDatabaseBytes), validationDatabaseBytes: number(limits.validationDatabaseBytes),
    bucketBytes: number(limits.bucketBytes), multipartBytes: number(limits.multipartBytes), localBytes: number(limits.localBytes),
    offsiteBytes: number(limits.offsiteBytes), hostFreeBytes: number(limits.hostFreeBytes), hostFreeInodes: number(limits.hostFreeInodes),
    offsiteFreeBytes: number(limits.offsiteFreeBytes), offsiteFreeInodes: number(limits.offsiteFreeInodes), operationReserveBytes: number(limits.operationReserveBytes),
  }
  const leaseMs = number(value.leaseMs), intervalMs = number(value.intervalMs), probeTimeoutMs = number(value.probeTimeoutMs)
  if (leaseMs > 120_000 || probeTimeoutMs > 30_000 || intervalMs + probeTimeoutMs >= leaseMs) throw new Error('Storage guard deadlines must fit the lease')
  if (!Array.isArray(value.filesystems) || value.filesystems.length < 1) throw new Error('Storage guard requires all backing filesystem paths')
  const filesystems = value.filesystems.map(path => {
    const result = text(path, /^\/[a-zA-Z0-9_./-]+$/)
    if (!isAbsolute(result) || resolve(result) !== result) throw new Error('Invalid storage guard filesystem')
    assertOwnerPath(result); return result
  })
  const endpoint = new URL(text(value.objectEndpoint, /^https?:\/\//))
  if (endpoint.origin !== value.objectEndpoint || endpoint.username || endpoint.password) throw new Error('Exact owner object endpoint required')
  return { limits: parsed, leaseMs, intervalMs, probeTimeoutMs, filesystems,
    databaseJournal: privatePath(value.databaseJournal), objectJournal: privatePath(value.objectJournal),
    rootEnvironmentFile: privatePath(value.rootEnvironmentFile), objectEndpoint: endpoint.origin,
    postgresContainer: text(value.postgresContainer, /^[a-f0-9]{64}$/), postgresAdmin: text(value.postgresAdmin, /^[a-z_][a-z0-9_]*$/),
    tempFileLimitBytes: number(value.tempFileLimitBytes) }
}
export type StorageGuardConfig = ReturnType<typeof parseStorageGuardConfig>

/** systemd supplies the actual deadline; never assume the template unit is installed unchanged. */
export function assertStorageGuardWatchdog(config: Pick<StorageGuardConfig, 'intervalMs' | 'probeTimeoutMs'>, watchdogUsec: string | undefined): void {
  const usec = watchdogUsec && /^\d+$/.test(watchdogUsec) ? Number(watchdogUsec) : NaN
  if (!Number.isSafeInteger(usec) || usec <= 0) throw new Error('Storage guard watch requires a positive safe-integer WATCHDOG_USEC from systemd')
  // Includes the bounded 3-second notification and headroom for local processing/I/O.
  if (config.intervalMs + config.probeTimeoutMs + 10_000 >= usec / 1000) throw new Error('Storage guard cycle plus 10s margin must fit the systemd watchdog deadline')
}

function privateJson(path: string): Record<string, unknown> {
  assertOwnerPath(path)
  const file = lstatSync(path)
  if (!file.isFile() || file.mode & 0o077 || file.uid !== process.getuid?.()) throw new Error('Storage guard owner file must be private and owned by the executing owner')
  return object(JSON.parse(readFileSync(path, 'utf8')))
}
export function readStorageGuardConfig(target: PrereleaseTarget, path: string): StorageGuardConfig {
  if (path === target.directory || resolve(path).startsWith(target.directory + sep)) throw new Error('Owner guard configuration must stay outside candidate paths')
  return parseStorageGuardConfig(target, privateJson(path))
}

/** Uses the host's bounded clients; it never needs to start a large tool container. */
export function nativeStorageGuard(target: PrereleaseTarget, config: StorageGuardConfig): StorageGuardNative {
  const database = privateJson(config.databaseJournal), objects = privateJson(config.objectJournal)
  const roles = [target.database.appRole, target.database.backupRole, target.validationDatabase.role]
  const passwords = object(database.passwords), owned = object(objects.ownedUsers), policies = object(objects.policyHashes)
  const identities = [object(objects.app), object(objects.backup)]
  if (database.format !== 1 || database.targetDirectory !== target.directory || Object.keys(passwords).sort().join() !== [...roles].sort().join()
    || objects.format !== 1 || objects.bucket !== target.objects.bucket || objects.prefix !== target.objects.prefix
    || owned.app !== true || owned.backup !== true || identities[0].accessKey !== target.objects.appKeyId || identities[1].accessKey !== target.objects.backupKeyId) throw new Error('Guard does not own these provisioned resources')
  const marker = `oa-1662-db-bootstrap:${text(database.operationId, /^[a-f0-9-]{36}$/)}`
  const systemIdentifier = text(database.systemIdentifier, /^\d+$/)
  const policyHashes = [text(policies.app, /^[a-f0-9]{64}$/), text(policies.backup, /^[a-f0-9]{64}$/)]
  const rootFile = lstatSync(config.rootEnvironmentFile)
  if (!rootFile.isFile() || rootFile.mode & 0o077 || rootFile.uid !== process.getuid?.()) throw new Error('Guard root credentials must be owner-private')
  const env = parseEnv(readFileSync(config.rootEnvironmentFile, 'utf8'))
  const rootKey = text(env.LOCAL_S3_ACCESS_KEY, /^[A-Za-z0-9_-]+$/), rootSecret = text(env.LOCAL_S3_SECRET_KEY, /^.+$/)
  if ([target.objects.appKeyId, target.objects.backupKeyId].includes(rootKey)) throw new Error('Guard needs distinct owner credentials')
  let deadline = Number.POSITIVE_INFINITY
  const remaining = () => {
    const ms = Math.min(config.probeTimeoutMs, deadline - Date.now())
    if (ms <= 0) throw new Error('Storage probe deadline exceeded')
    return ms
  }
  const run = (program: string, args: string[], input?: string, timeout = remaining()) => {
    try { return execFileSync(program, args, { input, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim() }
    catch { throw new Error(`Storage guard ${program} failed`) }
  }
  const sql = (query: string) => run('docker', ['exec', '-i', config.postgresContainer, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', config.postgresAdmin, '-d', 'postgres'],
    `SET statement_timeout='5s'; SET lock_timeout='2s';\n${query}`)
  const roleList = roles.map(literal).join(',')
  const databaseIdentity = () => {
    const result = object(JSON.parse(sql(`BEGIN READ ONLY;
      SELECT json_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),
        'roles',(SELECT json_agg(json_build_object('name',rolname,'marker',shobj_description(oid,'pg_authid'),'login',rolcanlogin,
          'elevated',rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls,
          'formal',has_database_privilege(oid,${literal(target.formal.database)},'CONNECT'),
          'canSetTemp',has_parameter_privilege(oid,'temp_file_limit','SET'),
          'tempBytes',(SELECT pg_size_bytes(split_part(setting,'=',2) || CASE WHEN split_part(setting,'=',2) ~ '^-?[0-9]+$' THEN 'kB' ELSE '' END) FROM pg_db_role_setting,unnest(setconfig) setting
            WHERE setrole=pg_roles.oid AND setdatabase=0 AND setting LIKE 'temp_file_limit=%')))
          FROM pg_roles WHERE rolname IN (${roleList})),
        'databases',(SELECT json_agg(json_build_object('name',datname,'owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database'),'bytes',pg_database_size(oid)::text))
          FROM pg_database WHERE datname IN (${literal(target.database.name)},${literal(target.validationDatabase.name)}))); COMMIT;`)))
    if (result.systemIdentifier !== systemIdentifier || !Array.isArray(result.roles) || result.roles.length !== 3
      || !Array.isArray(result.databases) || result.databases.length !== 2) throw new Error('Guard PostgreSQL ownership mismatch')
    const nativeRoles = result.roles.map(object), databases = result.databases.map(object)
    if (nativeRoles.some(row => !roles.includes(String(row.name)) || row.marker !== marker || row.elevated !== false || row.formal !== false)) throw new Error('Guard role ownership mismatch')
    for (const [name, owner] of [[target.database.name, target.database.appRole], [target.validationDatabase.name, target.validationDatabase.role]]) {
      const row = databases.find(row => row.name === name)
      if (!row || row.owner !== owner || row.marker !== marker) throw new Error('Guard database ownership mismatch')
    }
    return { nativeRoles, databases }
  }
  const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest()
  const admin = async (method: 'GET' | 'PUT', path: string, query: Record<string, string> = {}) => {
    const url = new URL(`${config.objectEndpoint}/rustfs/admin/v3/${path}`)
    const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    const qs = Object.entries(query).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&')
    url.search = qs
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0, 8), scope = `${day}/us-east-1/s3/aws4_request`
    const headers = { host: url.host, 'x-amz-content-sha256': hash(''), 'x-amz-date': date }
    const names = Object.keys(headers).sort(), signedHeaders = names.join(';')
    const request = [method, url.pathname, qs, Object.entries(headers).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}:${value}\n`).join(''), signedHeaders, hash('')].join('\n')
    const key = hmac(hmac(hmac(hmac(`AWS4${rootSecret}`, day), 'us-east-1'), 's3'), 'aws4_request')
    const authorization = `AWS4-HMAC-SHA256 Credential=${rootKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(key, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(request)}`).toString('hex')}`
    const response = await fetch(url, { method, headers: { ...headers, authorization }, redirect: 'error', signal: AbortSignal.timeout(remaining()) })
    if (!response.ok) { await response.body?.cancel(); throw new Error('Guard object administration failed') }
    const body = await response.text()
    return body ? object(JSON.parse(body)) : {}
  }
  const objectIdentity = async (index: number) => {
    const accessKey = index === 0 ? target.objects.appKeyId : target.objects.backupKeyId
    const user = await admin('GET', 'user-info', { accessKey })
    const groups = user.memberOf ?? []
    if (typeof user.policyName !== 'string' || !user.policyName || !Array.isArray(groups) || groups.length
      || !['enabled', 'disabled'].includes(String(user.status))) throw new Error('Guard object account binding mismatch')
    const policy = await admin('GET', 'info-canned-policy', { name: user.policyName })
    if (hash(JSON.stringify(normalizedPolicy(policy.policy))) !== policyHashes[index]) throw new Error('Guard object policy differs from private ownership journal')
    return { accessKey, status: user.status }
  }
  const disk = (path: string) => {
    const value = statfsSync(path)
    return { bytes: value.bavail * value.bsize, inodes: value.ffree }
  }
  const observe = async (mode: 'admission' | 'diagnostic' = 'admission') => {
    deadline = Date.now() + config.probeTimeoutMs
    const { nativeRoles, databases } = databaseIdentity()
    if (nativeRoles.some(row => mode === 'admission' && row.login !== true || row.canSetTemp !== false || bytes(row.tempBytes) !== config.tempFileLimitBytes)) throw new Error('Pre role login/temp-file policy is not configured')
    for (const index of [0, 1]) if ((await objectIdentity(index)).status !== 'enabled' && mode === 'admission') throw new Error('Pre object credentials are disabled')
    const quota = await admin('GET', 'get-bucket-quota', { bucket: target.objects.bucket })
    if (bytes(quota.quota) !== config.limits.bucketBytes) throw new Error('Native bucket quota differs from measured limit')
    const client = new S3Client({ endpoint: config.objectEndpoint, region: 'us-east-1', forcePathStyle: true,
      credentials: { accessKeyId: rootKey, secretAccessKey: rootSecret }, maxAttempts: 1,
      requestHandler: { connectionTimeout: 2000, requestTimeout: config.probeTimeoutMs } })
    let bucketBytes = 0, multipartBytes = 0, pages = 0
    const signal = AbortSignal.timeout(remaining())
    try {
      const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: target.objects.bucket }), { abortSignal: signal })
      if (versioning.Status) throw new Error('Versioned buckets require a complete version inventory before admission')
      let continuation: string | undefined
      do {
        if (++pages > 10_000) throw new Error('Object inventory exceeds bounded observation')
        const page = await client.send(new ListObjectsV2Command({ Bucket: target.objects.bucket, ContinuationToken: continuation }), { abortSignal: signal })
        for (const entry of page.Contents ?? []) bucketBytes += bytes(entry.Size)
        continuation = page.NextContinuationToken
        if (page.IsTruncated && !continuation) throw new Error('Incomplete object inventory')
      } while (continuation)
      let keyMarker: string | undefined, uploadMarker: string | undefined
      do {
        if (++pages > 10_000) throw new Error('Multipart inventory exceeds bounded observation')
        const page = await client.send(new ListMultipartUploadsCommand({ Bucket: target.objects.bucket, KeyMarker: keyMarker, UploadIdMarker: uploadMarker }), { abortSignal: signal })
        for (const upload of page.Uploads ?? []) {
          if (!upload.Key || !upload.UploadId) throw new Error('Invalid multipart inventory')
          let marker: string | undefined
          do {
            if (++pages > 10_000) throw new Error('Part inventory exceeds bounded observation')
            try {
              const parts = await client.send(new ListPartsCommand({ Bucket: target.objects.bucket, Key: upload.Key, UploadId: upload.UploadId, PartNumberMarker: marker }), { abortSignal: signal })
              for (const part of parts.Parts ?? []) multipartBytes += bytes(part.Size)
              marker = parts.IsTruncated ? parts.NextPartNumberMarker : undefined
              if (parts.IsTruncated && !marker) throw new Error('Incomplete part inventory')
            } catch (error) {
              if (error instanceof Error && error.name === 'NoSuchUpload') break
              throw error
            }
          } while (marker)
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined; uploadMarker = page.NextUploadIdMarker
        if (page.IsTruncated && !keyMarker) throw new Error('Incomplete multipart inventory')
      } while (keyMarker)
    } finally { client.destroy() }
    const seen = new Set<number>(), disks = []
    for (const path of [target.directory, ...config.filesystems]) {
      const device = statSync(path).dev
      if (!seen.has(device)) { seen.add(device); disks.push(disk(path)) }
    }
    const localBytes = bytes(run('du', ['-sx', '--block-size=1', target.directory]).split(/\s/)[0])
    const offsite = run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', target.offsite.host, 'sh', '-s', '--', target.offsite.directory],
      'set -eu\ntest "$(realpath -- "$1")" = "$1"\ndu -sx --block-size=1 -- "$1"\nstat -f -c "%a %S %d" -- "$1"\n').split('\n')
    if (offsite.length !== 2) throw new Error('Invalid offsite storage observation')
    const [freeBlocks, blockSize, freeInodes] = offsite[1].trim().split(/\s+/).map(bytes)
    remaining()
    return { sourceDatabaseBytes: bytes(databases.find(row => row.name === target.database.name)?.bytes),
      validationDatabaseBytes: bytes(databases.find(row => row.name === target.validationDatabase.name)?.bytes), bucketBytes, multipartBytes, localBytes,
      offsiteBytes: bytes(offsite[0].split(/\s/)[0]), hostFreeBytes: Math.min(...disks.map(value => value.bytes)),
      hostFreeInodes: Math.min(...disks.map(value => value.inodes)), offsiteFreeBytes: freeBlocks * blockSize, offsiteFreeInodes: freeInodes }
  }
  const stop = async () => {
    deadline = Number.POSITIVE_INFINITY
    const failures: string[] = []
    const attempt = async (name: string, action: () => void | Promise<void>) => { try { await action() } catch { failures.push(name) } }
    await attempt('owner-operation', () => stopStorageOperation(target))
    await attempt('target-containers', async () => {
      const selectors = [`label=com.docker.compose.project=${target.project}`, `label=org.open-agricola.backup.environment=${target.targetId}`]
      const ids = new Set(selectors.flatMap(selector => run('docker', ['ps', '-q', '--filter', selector]).split(/\s+/).filter(Boolean)))
      for (const id of ids) {
        if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Invalid container inventory')
        const row = object(JSON.parse(run('docker', ['inspect', '--format', '{{json .}}', id])))
        const labels = object(object(row.Config).Labels)
        const service = labels['com.docker.compose.service']
        const app = labels['com.docker.compose.project'] === target.project && service === 'app' && labels['org.open-agricola.environment'] === target.targetId
        const tool = labels['org.open-agricola.backup.environment'] === target.targetId && typeof labels['org.open-agricola.backup.run'] === 'string'
        if (!app && !tool) { if (service === 'gateway' && labels['com.docker.compose.project'] === target.project) continue; throw new Error('Unknown container ownership') }
        // A failed graceful stop still proceeds to the bounded kill path.
        try { run('docker', ['stop', '--timeout', app ? '20' : '2', id], undefined, app ? 23_000 : 5000) } catch { /* verified below */ }
        if (run('docker', ['inspect', '--format', '{{.State.Running}}', id]) === 'true') run('docker', ['kill', id])
        if (run('docker', ['inspect', '--format', '{{.State.Running}}', id]) !== 'false') throw new Error('Target writer is still running')
      }
    })
    await attempt('postgres-roles', () => {
      databaseIdentity()
      sql(`BEGIN; ${roles.map(role => `ALTER ROLE "${role}" NOLOGIN;`).join(' ')} COMMIT;`)
      sql(`SELECT pg_terminate_backend(pid,5000) FROM pg_stat_activity WHERE usename IN (${roleList}) AND pid<>pg_backend_pid();`)
      const remaining = bytes(sql(`SELECT count(*) FROM pg_stat_activity WHERE usename IN (${roleList});`))
      if (remaining !== 0 || databaseIdentity().nativeRoles.some(row => row.login !== false)) throw new Error('Pre database writers were not stopped')
    })
    for (const index of [0, 1]) await attempt(`object-account-${index}`, async () => {
      const { accessKey } = await objectIdentity(index)
      await admin('PUT', 'set-user-status', { accessKey, status: 'disabled' })
      if ((await objectIdentity(index)).status !== 'disabled') throw new Error('Pre object account was not disabled')
    })
    return failures
  }
  return { observe, stop }
}
