// Owner side of a formal cutover (ADR 0045, ADR 0047): while the host holds the
// stopped source, pull the Cutover Backup, validate it on this machine with the
// candidate's same-source arm64 validator image and hand the host a report bound to
// that capture, the deployed candidate image and the validator. Runs as its own
// process beside the maintenance SSH session.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDirectory, rsyncArguments, snapshotName, snapshots, validateCapture } from '../owner-backup'
import { verifyStorageArchive } from '../storage-archive'

const SSH_OPTIONS = ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=8']
const quote = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'"

export type OwnerRequest = {
  format: 1; nonce: string; capture: string; ledger: string; sourceBuildId: string; targetBuildId: string; targetImage: string
  createdAt: string; database: { sha256: string; size: number }; reportDeadlineEpochMs: number
}
/** `targetImage` is the deployed linux/amd64 image the host binds; `validatorImage` is the owner's local arm64 build of the same source. */
export type CutoverTarget = { directory: string; stage: string; sourceSha: string; targetImage: string; validatorImage: string; operationId: string }
export const VALIDATOR_PLATFORM = 'linux/arm64'
export type CutoverIo = {
  /** A remote file's text, or null while it does not exist. */
  read: (path: string) => string | null
  /** Copies the capture and ledger into `local`, returning their local paths. */
  pull: (request: OwnerRequest, local: string) => { capture: string; ledger: string }
  verify: (capture: string) => Promise<{ createdAt: string; database: { sha256: string; size: number } }>
  validate: (input: { capture: string; ledger: string; image: string; buildId: string; workParent: string }) => Record<string, unknown>
  /** The validator image the owner's receipt records for the candidate now, re-inspected in local Docker; null when gone. */
  validatorImage: () => Promise<string | null>
  upload: (report: Record<string, unknown>) => void
  keep: (local: string, request: OwnerRequest, report: Record<string, unknown>) => void
  sleep: (ms: number) => void
  now: () => number
  /** True once the maintenance session ended; no request can follow. */
  finished: () => boolean
}

/** A request is used only when it names this operation's private capture, candidate and image. */
export function parseOwnerRequest(text: string, target: CutoverTarget): OwnerRequest {
  const value = JSON.parse(text) as OwnerRequest
  const pending = join(target.directory, 'backups') + '/.pending-'
  if (value.format !== 1 || !/^[a-f0-9-]{36}$/.test(value.nonce ?? '')
    || typeof value.capture !== 'string' || !value.capture.startsWith(pending) || !/^[A-Za-z0-9-]+\/capture$/.test(value.capture.slice(pending.length))
    || value.ledger !== join(target.directory, 'backups/replay-removals.latest.json')
    || value.targetBuildId !== target.sourceSha || value.targetImage !== target.targetImage || !/^[a-f0-9]{40}$/.test(value.sourceBuildId ?? '')
    || !Number.isFinite(Date.parse(value.createdAt)) || !/^[a-f0-9]{64}$/.test(value.database?.sha256 ?? '') || !Number.isSafeInteger(value.database?.size)
    || !Number.isSafeInteger(value.reportDeadlineEpochMs)) throw new Error('Owner request does not match this cutover')
  return value
}

/**
 * Waits for the host's validation decision. In owner mode it validates the
 * published capture and always answers: a bound report, or an explicit failure
 * so the host restarts the source at once instead of waiting out its deadline.
 */
export async function ownerCutover(target: CutoverTarget, io: CutoverIo, root: string): Promise<'host' | 'reported' | 'failed' | 'ended'> {
  let mode: string | null = null
  while (mode === null) {
    const text = io.read(join(target.stage, 'validation-mode.json'))
    if (text) mode = (JSON.parse(text) as { mode: string }).mode
    else if (io.finished()) return 'ended'
    else io.sleep(2000)
  }
  if (mode !== 'owner') return 'host'
  let text: string | null
  while (!(text = io.read(join(target.stage, 'owner-request.json')))) {
    if (io.finished()) return 'ended'
    io.sleep(2000)
  }
  let request: OwnerRequest | undefined
  const local = privateDirectory(join(root, `.cutover-${target.operationId}`))
  try {
    request = parseOwnerRequest(text, target)
    const pulled = io.pull(request, local)
    const archive = await io.verify(pulled.capture)
    if (archive.createdAt !== request.createdAt || archive.database.sha256 !== request.database.sha256 || archive.database.size !== request.database.size) {
      throw new Error('Pulled capture differs from the owner request')
    }
    // The receipt must still name this exact local image: a rebuilt or removed validator cannot answer for the cutover.
    if (await io.validatorImage() !== target.validatorImage) throw new Error('The validator image changed or is gone since the delivery selected it')
    const validation = io.validate({ ...pulled, image: target.validatorImage, buildId: request.targetBuildId, workParent: local })
    const report = { ...validation, validator: 'owner-local', image: request.targetImage, validatorImage: target.validatorImage, validatorPlatform: VALIDATOR_PLATFORM, nonce: request.nonce }
    if (io.now() > request.reportDeadlineEpochMs) throw new Error('Owner validation finished after the host deadline')
    io.upload(report)
    io.keep(local, request, report)
    return 'reported'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Owner-local Validation failed: ${message}\n`)
    if (!request || io.now() <= request.reportDeadlineEpochMs) {
      try { io.upload({ ok: false, error: message.slice(0, 300) }) } catch { /* the host deadline restarts the source */ }
    }
    return 'failed'
  } finally { rmSync(local, { recursive: true, force: true }) }
}

/** SSH, rsync and Docker on this machine; the latest Owner-local Backup is the rsync basis. */
export function ownerCutoverIo(host: string, target: CutoverTarget, root: string, finished: () => boolean): CutoverIo {
  const run = (command: string, args: string[], timeout = 30 * 60_000) =>
    execFileSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })
  const ssh = (command: string, timeout = 60_000) => run('ssh', [...SSH_OPTIONS, host, command], timeout)
  const zstd = (() => { try { return run('rsync', ['--version']).includes('zstd') } catch { return false } })()
  return {
    read: path => { try { return ssh(`cat ${quote(path)} 2>/dev/null || true`) || null } catch { return null } },
    pull: (request, local) => {
      const basis = snapshots(root).at(-1)
      const capture = join(local, 'capture'), ledger = join(local, 'ledger.json')
      run('rsync', rsyncArguments({ host, source: `${request.capture}/`, destination: `${capture}/`, linkDest: basis && existsSync(join(root, basis, 'capture')) ? join(root, basis, 'capture') : null, zstd }), 30 * 60_000)
      run('rsync', rsyncArguments({ host, source: request.ledger, destination: ledger, linkDest: null, zstd }))
      return { capture, ledger }
    },
    verify: capture => verifyStorageArchive(capture),
    validate: input => validateCapture(input),
    validatorImage: async () => (await import('./validator-image.ts')).validatorReceipt(target.sourceSha, { channel: 'stable' })?.imageId ?? null,
    upload: report => {
      const partial = join(target.stage, 'owner-report.json.partial'), path = join(target.stage, 'owner-report.json')
      const script = `umask 077 && cat > ${quote(partial)} && mv ${quote(partial)} ${quote(path)}`
      execFileSync('ssh', [...SSH_OPTIONS, host, script], { input: JSON.stringify(report) + '\n', timeout: 60_000, stdio: ['pipe', 'ignore', 'inherit'] })
    },
    keep: (local, request, report) => {
      // The validated Cutover Backup also becomes the newest Owner-local Backup and the next rsync basis.
      const name = snapshotName(request.createdAt), snapshot = join(root, name)
      if (existsSync(snapshot)) return
      writeFileSync(join(local, 'source.json'), JSON.stringify({ name: 'cutover', sourceBuildId: request.sourceBuildId, image: request.targetImage, host,
        capturedAt: request.createdAt, pulledAt: new Date().toISOString(), archiveVersion: 2 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      writeFileSync(join(local, 'validation.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      const kept = join(root, `.incoming-${Date.now()}`)
      mkdirSync(kept, { mode: 0o700 })
      for (const entry of ['capture', 'ledger.json', 'source.json', 'validation.json']) renameSync(join(local, entry), join(kept, entry))
      renameSync(kept, snapshot)
    },
    sleep: ms => { execFileSync('sleep', [String(ms / 1000)]) },
    now: () => Date.now(),
    finished,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [host, directory, stage, sourceSha, targetImage, validatorImage, operationId, finishedMarker] = process.argv.slice(2)
    if (!host || !directory || !stage || !sourceSha || !targetImage || !/^sha256:[a-f0-9]{64}$/.test(validatorImage ?? '') || !operationId || !finishedMarker) {
      throw new Error('Usage: owner-cutover.ts <host> <directory> <stage> <source-sha> <target-image> <validator-image> <operation-id> <finished-marker>')
    }
    const root = resolve(process.env.OWNER_BACKUP_ROOT ?? join(homedir(), 'oa-backup'))
    privateDirectory(root)
    const target = { directory, stage, sourceSha, targetImage, validatorImage, operationId }
    const outcome = await ownerCutover(target, ownerCutoverIo(host, target, root, () => existsSync(finishedMarker)), root)
    process.stdout.write(JSON.stringify({ outcome }) + '\n')
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 }
}
