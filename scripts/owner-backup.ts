// Owner-local Backup: pull an online capture from the formal host into
// ~/oa-backup/<UTC stamp>/, validate it on this machine with the arm64 validator
// image of the build the host was running, and keep copies at most 30 days
// (ADR 0010, ADR 0045, ADR 0047).
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POSTGRES_IMAGE, verifyStorageArchive } from './storage-archive'

export const RETENTION_DAYS = 30
const OBJECTS_IMAGE = 'rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c'
const SNAPSHOT = /^\d{8}T\d{6}Z$/
const SSH_OPTIONS = ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=8']

export type OwnerCapture = { name: string; sourceBuildId: string; image: string }
export type SnapshotSource = OwnerCapture & { host: string; capturedAt: string; pulledAt: string; archiveVersion: number }

/** The host prints one `OWNER_CAPTURE {json}` line; anything else is compose output. */
export function parseCaptureLine(output: string): OwnerCapture {
  const line = output.split('\n').filter(text => text.startsWith('OWNER_CAPTURE ')).at(-1)
  if (!line) throw new Error('The host did not report an owner capture')
  const value = JSON.parse(line.slice('OWNER_CAPTURE '.length)) as Record<string, unknown>
  if (typeof value.name !== 'string' || !/^\.capture-owner-[A-Za-z0-9-]+$/.test(value.name)
    || typeof value.sourceBuildId !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceBuildId)
    || typeof value.image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.image)) throw new Error('Invalid owner capture report')
  return { name: value.name, sourceBuildId: value.sourceBuildId, image: value.image }
}

/** Snapshot directories are named by the capture time, so names sort and age without trusting mtimes. */
export function snapshotName(createdAt: string): string {
  const time = Date.parse(createdAt)
  if (!Number.isFinite(time)) throw new Error('Invalid capture time')
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll('-', '').replaceAll(':', '')
}

export function snapshotTime(name: string): number {
  if (!SNAPSHOT.test(name)) return NaN
  return Date.parse(`${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}T${name.slice(9, 11)}:${name.slice(11, 13)}:${name.slice(13, 15)}Z`)
}

/** Every copy older than the limit goes, including the newest: the limit binds the copy, not the series. */
export function expiredSnapshots(names: readonly string[], now: number, days = RETENTION_DAYS): string[] {
  return names.filter(name => { const time = snapshotTime(name); return Number.isFinite(time) && now - time > days * 86_400_000 })
}

export function rsyncArguments({ host, source, destination, linkDest, zstd }: { host: string; source: string; destination: string; linkDest: string | null; zstd: boolean }): string[] {
  return ['-a', '--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=', '--compress', ...(zstd ? ['--compress-choice=zstd'] : []),
    ...(linkDest ? [`--link-dest=${linkDest}`] : []), '-e', `ssh ${SSH_OPTIONS.join(' ')}`, `${host}:${source}`, destination]
}

export const privateDirectory = (path: string): string => {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  const info = lstatSync(path)
  if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077) throw new Error(`Owner backup directory must be private: ${path}`)
  return path
}
export const snapshots = (root: string): string[] => readdirSync(root).filter(name => SNAPSHOT.test(name)).sort()
const VALIDATION_LABEL = 'org.open-agricola.owner-validation'
export type ValidationResource = { id: string; owner: number; deadline: number }
/** Throwaway validation services outlive a killed tool; a later run or the unit's stop hook removes them. */
export function abandonedValidations(resources: readonly ValidationResource[], now: number, alive: (pid: number) => boolean): string[] {
  return resources.filter(item => !Number.isSafeInteger(item.owner) || item.owner <= 0 || !alive(item.owner) || !(item.deadline > now)).map(item => item.id)
}
const processAlive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' } }
export function reapValidations(now = Date.now()): string[] {
  const removed: string[] = []
  for (const kind of ['container', 'network'] as const) {
    const listing = run('docker', [kind, 'ls', ...(kind === 'container' ? ['-a'] : []), '--filter', `label=${VALIDATION_LABEL}`, '--format',
      `{{.ID}} {{.Label "${VALIDATION_LABEL}.owner"}} {{.Label "${VALIDATION_LABEL}.deadline"}}`]).trim()
    const resources = listing ? listing.split('\n').map(line => { const [id, owner, deadline] = line.split(' '); return { id: id!, owner: Number(owner), deadline: Number(deadline) } }) : []
    for (const id of abandonedValidations(resources, now, processAlive)) {
      try { run('docker', kind === 'container' ? ['rm', '-f', '-v', id] : ['network', 'rm', id]); removed.push(`${kind}:${id}`) } catch { /* already gone */ }
    }
  }
  return removed
}
const run = (command: string, args: string[], timeout = 30 * 60_000): string =>
  execFileSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })

type Options = { host: string; remoteDir: string; root: string }

export async function pullSnapshot({ host, remoteDir, root }: Options, attempts = 3): Promise<string> {
  privateDirectory(root)
  const ssh = (command: string) => run('ssh', [...SSH_OPTIONS, host, `cd ${remoteDir} && bash scripts/owner-sync-capture.sh ${command}`], 35 * 60_000)
  // The daily host backup shares the maintenance lock; wait it out a few times.
  let capture: OwnerCapture | undefined
  for (let attempt = 1; !capture; attempt++) {
    try { capture = parseCaptureLine(ssh('capture')) } catch (error) {
      if (attempt >= attempts) throw error
      process.stderr.write(`Owner capture attempt ${attempt} failed; retrying in 10 minutes\n`)
      execFileSync('sleep', ['600'])
    }
  }
  const incoming = privateDirectory(join(root, `.incoming-${Date.now()}`))
  try {
    const previous = snapshots(root).at(-1)
    const zstd = run('rsync', ['--version']).includes('zstd')
    const remote = `${remoteDir}/backups/${capture.name}`
    run('rsync', rsyncArguments({ host, source: `${remote}/capture/`, destination: join(incoming, 'capture/'),
      linkDest: previous && existsSync(join(root, previous, 'capture')) ? join(root, previous, 'capture') : null, zstd }), 60 * 60_000)
    run('rsync', rsyncArguments({ host, source: `${remote}/ledger.json`, destination: join(incoming, 'ledger.json'), linkDest: null, zstd }))
    const manifest = await verifyStorageArchive(join(incoming, 'capture'))
    const name = snapshotName(manifest.createdAt)
    if (existsSync(join(root, name))) throw new Error(`Snapshot already exists: ${name}`)
    const source: SnapshotSource = { ...capture, host, capturedAt: manifest.createdAt, pulledAt: new Date().toISOString(), archiveVersion: manifest.version }
    writeFileSync(join(incoming, 'source.json'), JSON.stringify(source, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    renameSync(incoming, join(root, name))
    return join(root, name)
  } finally {
    rmSync(incoming, { recursive: true, force: true })
    try { ssh(`release ${capture.name}`) } catch { process.stderr.write('Owner capture release failed; the next capture or daily pruning removes it\n') }
  }
}

/**
 * Isolated restore + full storage validation of an archive directory in `image`, on throwaway PostgreSQL and
 * RustFS containers attached to an internal Docker network. Returns the image's validation report.
 */
export function validateCapture({ capture, ledger, image, buildId, workParent }: { capture: string; ledger: string; image: string; buildId: string; workParent: string }): Record<string, unknown> {
  try { run('docker', ['image', 'inspect', '--format', '{{.Id}}', image]) } catch {
    throw new Error(`Validation image ${image} is not on this machine; build the validator image with scripts/release/validator-image.ts`)
  }
  reapValidations()
  const id = randomBytes(6).toString('hex'), network = `oa-owner-validate-${id}`, postgres = `${network}-postgres`, objects = `${network}-objects`
  const labels = ['--label', VALIDATION_LABEL, '--label', `${VALIDATION_LABEL}.owner=${process.pid}`, '--label', `${VALIDATION_LABEL}.deadline=${Date.now() + 40 * 60_000}`]
  const work = mkdtempSync(join(workParent, '.validate-')), scratch = privateDirectory(join(work, 'scratch'))
  const password = randomBytes(24).toString('hex'), key = randomBytes(16).toString('hex'), secret = randomBytes(32).toString('hex')
  const environment = join(work, 'tool.env')
  writeFileSync(join(work, 'postgres.env'), `POSTGRES_USER=agricola\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=agricola\n`, { mode: 0o600 })
  writeFileSync(join(work, 'objects.env'), `RUSTFS_ACCESS_KEY=${key}\nRUSTFS_SECRET_KEY=${secret}\nRUSTFS_CONSOLE_ENABLE=false\nRUSTFS_OBS_LOGGER_LEVEL=error\n`, { mode: 0o600 })
  writeFileSync(environment, [`DATABASE_URL=postgresql://agricola:${password}@${postgres}:5432/agricola`, `S3_ENDPOINT=http://${objects}:9000`,
    'S3_BUCKET=agricola', 'S3_PREFIX=', 'S3_REGION=us-east-1', `S3_ACCESS_KEY_ID=${key}`, `S3_SECRET_ACCESS_KEY=${secret}`, 'S3_FORCE_PATH_STYLE=true',
    `GAME_BUILD_ID=${buildId}`, 'NODE_ENV=production', 'STORAGE_VALIDATION_CONCURRENCY=auto', 'BACKUP_SCRATCH_DIRECTORY=/scratch', ''].join('\n'), { mode: 0o600 })
  const tool = (args: string[], timeout = 30 * 60_000) => run('docker', ['run', '--rm', '--network', network, '--user', `${process.getuid?.()}:${process.getgid?.()}`,
    '--env-file', environment, '-e', `BACKUP_DEADLINE_EPOCH_MS=${Date.now() + 29 * 60_000}`,
    '-v', `${capture}:/backup/capture:ro`, '-v', `${ledger}:/backup/ledger.json:ro`, '-v', `${scratch}:/scratch`, image, ...args], timeout)
  try {
    run('docker', ['network', 'create', '--internal', ...labels, network])
    run('docker', ['run', '-d', '--rm', ...labels, '--name', postgres, '--network', network, '--env-file', join(work, 'postgres.env'), '--tmpfs', '/var/lib/postgresql:rw,size=16g', '--shm-size=1g', POSTGRES_IMAGE])
    run('docker', ['run', '-d', '--rm', ...labels, '--name', objects, '--network', network, '--env-file', join(work, 'objects.env'), '--tmpfs', '/data:rw,uid=10001,gid=10001,mode=0700,size=8g', OBJECTS_IMAGE, '/data'])
    for (let attempt = 0; ; attempt++) {
      try { run('docker', ['exec', postgres, 'pg_isready', '-U', 'agricola', '-d', 'agricola']); break } catch { if (attempt > 60) throw new Error('Validation database did not start') }
      execFileSync('sleep', ['1'])
    }
    const bucket = "const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3'); const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }); await client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }))"
    for (let attempt = 0; ; attempt++) {
      try { tool(['node', '--input-type=module', '-e', bucket], 60_000); break } catch { if (attempt > 30) throw new Error('Validation object store did not start') }
      execFileSync('sleep', ['1'])
    }
    tool(['node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', 'ledger-merge', '/backup/ledger.json'])
    const output = tool(['node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', 'validate', '/backup/capture'])
    return JSON.parse(output.slice(output.indexOf('{'))) as Record<string, unknown>
  } finally {
    for (const name of [postgres, objects]) try { run('docker', ['rm', '-f', '-v', name]) } catch { /* not started */ }
    try { run('docker', ['network', 'rm', network]) } catch { /* not created */ }
    rmSync(work, { recursive: true, force: true })
  }
}

/** The local arm64 validator image ID for a source build: the recorded one, else a fresh isolated build. */
export type SnapshotValidator = (sourceBuildId: string) => Promise<string>

export const ownerValidator: SnapshotValidator = async sourceBuildId => {
  const { ensureValidatorImage, validatorReceipt } = await import('./release/validator-image.ts')
  return (validatorReceipt(sourceBuildId, { channel: 'stable' }) ?? await ensureValidatorImage(sourceBuildId, { channel: 'stable' })).imageId
}

/**
 * Validates a pulled snapshot and records the report beside it. The owner machine is aarch64 and cannot run the host's
 * linux/amd64 image, so it validates with the same-source arm64 validator image (ADR 0047); `source.image`, the host's
 * native image ID, stays the recorded binding and is never looked up locally. Without a validator nothing is written.
 */
export async function validateSnapshot(snapshot: string, { validator = ownerValidator, validate = validateCapture }: { validator?: SnapshotValidator; validate?: typeof validateCapture } = {}): Promise<Record<string, unknown>> {
  const source = JSON.parse(readFileSync(join(snapshot, 'source.json'), 'utf8')) as SnapshotSource
  if (existsSync(join(snapshot, 'validation.json'))) throw new Error('Snapshot is already validated')
  if (!/^[a-f0-9]{40}$/.test(source.sourceBuildId ?? '')) throw new Error('Snapshot source build is invalid')
  let validatorImage: string
  try { validatorImage = await validator(source.sourceBuildId) } catch (error) {
    throw new Error(`Owner-local Validation of ${snapshot} needs the arm64 validator image of ${source.sourceBuildId}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(validatorImage)) throw new Error('Invalid validator image ID')
  const report = { ...validate({ capture: join(snapshot, 'capture'), ledger: join(snapshot, 'ledger.json'), image: validatorImage, buildId: source.sourceBuildId, workParent: snapshot }),
    validator: 'owner-local', image: source.image, validatorImage, validatorPlatform: 'linux/arm64' }
  writeFileSync(join(snapshot, 'validation.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return report
}

export function pruneSnapshots(root: string, now = Date.now()): string[] {
  const removed = expiredSnapshots(snapshots(root), now)
  for (const name of removed) rmSync(join(root, name), { recursive: true, force: true })
  for (const name of readdirSync(root).filter(name => /^\.incoming-\d+$/.test(name) && now - Number(name.slice(10)) > 86_400_000)) {
    rmSync(join(root, name), { recursive: true, force: true })
  }
  return removed
}

function parseOptions(args: string[]): Options & { snapshot?: string; attempts: number } {
  const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined }
  const host = value('--host') ?? process.env.OWNER_BACKUP_HOST ?? ''
  const remoteDir = value('--remote-dir') ?? process.env.OWNER_BACKUP_REMOTE_DIR ?? '/home/ubuntu/open-agricola'
  const root = resolve(value('--root') ?? process.env.OWNER_BACKUP_ROOT ?? join(homedir(), 'oa-backup'))
  if (host && !/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(host)) throw new Error('Invalid owner backup host')
  if (!/^\/[A-Za-z0-9_./-]+$/.test(remoteDir) || remoteDir.includes('..')) throw new Error('Invalid remote deployment directory')
  const attempts = Number(value('--attempts') ?? 3)
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('Invalid capture attempt count')
  return { host, remoteDir, root, snapshot: value('--snapshot'), attempts }
}

export async function ownerBackup(args: string[]): Promise<void> {
  const [command] = args, options = parseOptions(args.slice(1))
  if (command === 'prune') { process.stdout.write(JSON.stringify({ removed: pruneSnapshots(privateDirectory(options.root)) }) + '\n'); return }
  if (command === 'reap') { process.stdout.write(JSON.stringify({ removed: reapValidations() }) + '\n'); return }
  if (command === 'validate') {
    const snapshot = options.snapshot ? resolve(options.snapshot) : join(options.root, snapshots(privateDirectory(options.root)).at(-1) ?? '')
    process.stdout.write(JSON.stringify(await validateSnapshot(snapshot)) + '\n'); return
  }
  if (command !== 'pull' && command !== 'run') throw new Error('Usage: owner-backup.ts run|pull|validate|prune|reap [--host user@host] [--remote-dir D] [--root R] [--snapshot S]')
  if (!options.host) throw new Error('--host or OWNER_BACKUP_HOST is required')
  try {
    const snapshot = await pullSnapshot(options, options.attempts)
    process.stdout.write(JSON.stringify({ snapshot }) + '\n')
    if (command === 'run') process.stdout.write(JSON.stringify(await validateSnapshot(snapshot)) + '\n')
  } finally {
    // Retention runs even after a failed pull, without hiding that failure.
    try { process.stdout.write(JSON.stringify({ removed: pruneSnapshots(privateDirectory(options.root)) }) + '\n') }
    catch (error) { process.stderr.write(`Owner backup pruning failed: ${error instanceof Error ? error.message : String(error)}\n`) }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await ownerBackup(process.argv.slice(2)) }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 }
}
