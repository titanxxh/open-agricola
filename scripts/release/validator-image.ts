// Owner validator image (#1817): a native linux/arm64 build of a fixed source for owner-side storage validation. The
// owner machine is aarch64 and cannot run the deployed linux/amd64 image in Docker, so it validates with a same-source
// arm64 build. The build runs in the owner-local candidate isolation (a disposable UID 61000 with its own rootless
// Docker, as the recorder and the GitHub image producer use) with the producer's BuildKit script and only the platform
// changed. After teardown the trusted owner verifies the archive, loads it into the owner's Docker, checks its identity
// and native modules, and records a private receipt.
//   pnpm exec tsx scripts/release/validator-image.ts build --sha <full-sha> [--channel stable|prerelease] [--rebuild]
//   pnpm exec tsx scripts/release/validator-image.ts show --sha <full-sha> [--channel stable|prerelease]
// Run it from the trusted protected-main checkout; its clean HEAD is the producer. Candidate code never runs as the owner.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CandidateExecution } from '../ci/candidate-isolation.ts'
import { CONTAINER_IMAGE_BUILDERS, MAX_CONTAINER_IMAGE_BYTES, isolatedImageBuildScript } from '../ci/container-image-build.ts'
import {
  acquireOwnerLocalLock, assertNoReservedCandidatePaths, assertPrivateHome, CANDIDATE_TMPDIR, candidateProperties, checkoutTrustedSource,
  isolationSmokeImage, nativeRunner, NETWORK_ATTEMPTS, OWNER_LOCAL_NODE, PREPARATION_RETRY_DELAY_MS, trustedPublicAssets, type PhaseRecord, type Runner,
} from '../ci/owner-local-run.ts'
import { fullSha } from '../ci/verification-tasks.ts'
import { inspectLoadedContainerImage, nativeContainerImageId, validateContainerImageArchive } from '../ci/container-images-archive.ts'
import { ownerMachine } from '../ci/release-github.ts'

export const VALIDATOR_PLATFORM = 'linux/arm64'
export type ValidatorChannel = 'stable' | 'prerelease'
export type ValidatorReceipt = {
  format: 1; kind: 'owner-validator-image'; sourceSha: string; producerSha: string; channel: ValidatorChannel; platform: typeof VALIDATOR_PLATFORM
  /** The image ID in the owner's local Docker, which runs the validation. */
  imageId: string
  configDigest: string; archiveManifestDigest: string | null; archiveSha256: string; archiveBytes: number
  builderImage: string; buildLogSha256: string
  isolation: { startSha256: string; stopSha256: string; cleanupSha256: string; preparation: PhaseRecord[] }
  createdAt: string
}
export type DockerCommand = (args: string[], timeout?: number) => string

const UID = 61000
const TASK = 'validator-image'
const BUILD_ATTEMPTS = 2
const policyRoot = resolve(import.meta.dirname, '../..')
export const VALIDATOR_STATE_ROOT = join(homedir(), '.local/state/open-agricola/validator-images')
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const fileSha256 = (path: string) => sha256(readFileSync(path))
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
const channelOf = (value: string): ValidatorChannel => { if (value !== 'stable' && value !== 'prerelease') throw new Error('--channel must be stable or prerelease'); return value }
const purposeOf = (channel: ValidatorChannel) => channel === 'prerelease' ? 'candidate' as const : 'formal-candidate' as const
export const validatorReceiptPath = (sha: string, channel: ValidatorChannel, root = VALIDATOR_STATE_ROOT) => join(root, `${fullSha(sha)}-${channel}.json`)

/** The owner's own Docker, with only its connection settings: never a candidate or registry credential. */
export const ownerDocker: DockerCommand = (args, timeout = 30_000) => {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) if (process.env[key]) env[key] = process.env[key]
  return execFileSync('docker', args, { env, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid validator image record')
  return Object.fromEntries(Object.entries(value))
}

export type ValidatorInputs = {
  sha: string; channel: ValidatorChannel; producerSha: string
  /** Private run directory holding `logs/` and the trusted `source/` checkout with its tracked `context.tar`. */
  output: string
  ownerUid: number; ownerHome: string; publicAssets: string; node: string
  stateRoot: string
  /** The candidate's work root; only tests move it. */
  workRoot?: string
  maxImageBytes?: number
  now?: () => number
}

/** A candidate output file after teardown: a single regular file of bounded size directly in the task copy. */
function candidateOutput(work: string, name: string, maximum: number): string {
  for (const directory of [resolve(work, '..'), work]) {
    const info = lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Untrusted validator build directory')
  }
  const path = join(work, name), info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size <= 0 || info.size > maximum) throw new Error(`Untrusted validator image output: ${name}`)
  return path
}

/**
 * The isolated build and trusted verification of one validator image. The receipt is written only after the candidate
 * identity is gone, the archive passed the producer's structural checks for linux/arm64, and the loaded image carries
 * the fixed source, channel and hosted frontend and loads its native modules.
 */
export async function buildValidatorImage(inputs: ValidatorInputs, runner: Runner, docker: DockerCommand, sleep = pause, exit: (code: number) => void = code => process.exit(code)): Promise<ValidatorReceipt> {
  const { sha, channel, output } = inputs
  fullSha(sha); fullSha(inputs.producerSha)
  const logs = join(output, 'logs'), maxImageBytes = inputs.maxImageBytes ?? MAX_CONTAINER_IMAGE_BYTES, now = inputs.now ?? Date.now
  const execution: CandidateExecution = { uid: UID, gid: UID, home: '/home/oa-candidate', work: join(inputs.workRoot ?? '/home/oa-candidate/work', TASK),
    socket: `/run/user/${UID}/docker.sock`, node: inputs.node, privateDirectory: logs }
  // The candidate gets only its isolation defaults: no owner, registry or GitHub credential exists in its environment.
  const environment = { TMPDIR: CANDIDATE_TMPDIR }, properties = candidateProperties(inputs.ownerHome)
  const preparation: PhaseRecord[] = []
  const step = async (command: string, args: string[], phase: string, attempts = 1, beforeRetry?: (attempt: number) => Promise<void>) => {
    for (let attempt = 0; ; attempt++) {
      const name = attempt ? `${phase}-a${attempt}` : phase
      const exitCode = await runner.candidate(execution, command, args, name, environment, properties)
      preparation.push({ phase: name, exitCode, logSha256: fileSha256(join(logs, `${name}.log`)) })
      if (exitCode === 0) return name
      if (attempt + 1 >= attempts) throw new Error(`Validator image ${phase} failed (exit ${exitCode})`)
      await sleep(PREPARATION_RETRY_DELAY_MS)
      await beforeRetry?.(attempt + 1)
    }
  }
  let failure: { error: unknown } | undefined, buildPhase = 'image-build'
  const stop = join(output, 'isolation-stop.log'), cleanup = join(output, 'isolation-cleanup.log')
  // An interrupted owner still tears the candidate down; a started identity is never left running.
  const interrupted = (signal: NodeJS.Signals = 'SIGTERM') => {
    for (const teardown of [['stop', output, String(inputs.ownerUid), TASK], ['cleanup', output, String(inputs.ownerUid)]]) {
      try { runner.isolation(teardown, join(output, `isolation-${teardown[0]}-${signal.toLowerCase()}.log`)) } catch { /* reported in its log */ }
    }
    exit(130)
  }
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted)
  try {
    runner.isolation(['start', policyRoot, output, String(inputs.ownerUid), inputs.publicAssets, TASK], join(output, 'isolation-start.log'))
    await step('docker', ['pull', '--quiet', isolationSmokeImage(policyRoot)], 'smoke-image', NETWORK_ATTEMPTS)
    await step(inputs.node, ['/run/oa-ci-isolation/smoke.mts'], 'smoke')
    // BuildKit pulls its builder and base images; a network failure gets one fresh builder and another attempt.
    buildPhase = await step('/usr/bin/timeout', ['--signal=TERM', '--kill-after=10s', '1800', '/bin/bash', '-euo', 'pipefail', '-c', isolatedImageBuildScript(sha, channel, VALIDATOR_PLATFORM)],
      'image-build', BUILD_ATTEMPTS, async attempt => {
        const phase = `image-build-reset-a${attempt}`
        preparation.push({ phase, exitCode: await runner.candidate(execution, 'docker', ['buildx', 'rm', 'oa-image'], phase, environment, properties), logSha256: fileSha256(join(logs, `${phase}.log`)) })
      })
  } catch (error) { failure = { error } }
  finally {
    process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted)
    try { runner.isolation(['stop', output, String(inputs.ownerUid), TASK], stop) } catch (error) { failure ??= { error } }
    try {
      // Every candidate process is gone and the copy belongs to the owner: the outputs can no longer change.
      if (!failure) for (const name of ['image.tar', 'image-metadata.json']) {
        const target = join(output, name)
        copyFileSync(candidateOutput(execution.work, name, name === 'image.tar' ? maxImageBytes : 65_536), target); chmodSync(target, 0o600)
      }
    } catch (error) { failure ??= { error } }
    finally { runner.isolation(['cleanup', output, String(inputs.ownerUid)], cleanup) }
  }
  if (failure) throw failure.error
  const archivePath = join(output, 'image.tar')
  const configDigest = object(JSON.parse(readFileSync(join(output, 'image-metadata.json'), 'utf8')))['containerimage.config.digest']
  if (typeof configDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(configDigest)) throw new Error('BuildKit did not identify the validator image config digest')
  const archive = validateContainerImageArchive({ archivePath, imageId: configDigest, sourceSha: sha, channel, maxBytes: maxImageBytes, allowProducerTag: true, architecture: 'arm64' })
  const imageId = nativeContainerImageId({ configDigest, manifestDigest: archive.archiveManifestDigest }, args => docker(args))
  docker(['load', '--input', archivePath], 15 * 60_000)
  inspectLoadedContainerImage({ imageId, expected: { purpose: purposeOf(channel), sourceSha: sha, producerSha: inputs.producerSha }, architecture: 'arm64' }, args => docker(args))
  // The storage validator depends on these native modules; the GitHub producer checks them the same way for amd64.
  docker(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
    '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '--pids-limit', '64', '--entrypoint', 'node', imageId,
    '-e', 'require("canvas")'], 60_000)
  const receipt: ValidatorReceipt = { format: 1, kind: 'owner-validator-image', sourceSha: sha, producerSha: inputs.producerSha, channel, platform: VALIDATOR_PLATFORM,
    imageId, configDigest, archiveManifestDigest: archive.archiveManifestDigest, archiveSha256: archive.sha256, archiveBytes: archive.bytes,
    builderImage: CONTAINER_IMAGE_BUILDERS[VALIDATOR_PLATFORM], buildLogSha256: fileSha256(join(logs, `${buildPhase}.log`)),
    isolation: { startSha256: fileSha256(join(output, 'isolation-start.log')), stopSha256: fileSha256(stop), cleanupSha256: fileSha256(cleanup), preparation },
    createdAt: new Date(now()).toISOString() }
  mkdirSync(inputs.stateRoot, { recursive: true, mode: 0o700 }); chmodSync(inputs.stateRoot, 0o700)
  const path = validatorReceiptPath(sha, channel, inputs.stateRoot), partial = `${path}.partial`
  writeFileSync(partial, JSON.stringify(receipt, null, 1) + '\n', { mode: 0o600 }); renameSync(partial, path)
  return receipt
}

const RECEIPT_KEYS = ['archiveBytes', 'archiveManifestDigest', 'archiveSha256', 'builderImage', 'buildLogSha256', 'channel', 'configDigest', 'createdAt',
  'format', 'imageId', 'isolation', 'kind', 'platform', 'producerSha', 'sourceSha'].sort()

/**
 * The recorded validator image for `sha`, after re-inspecting that the owner's Docker still holds that exact arm64
 * image for the fixed source and channel; null when no receipt exists or the image was removed.
 */
export function validatorReceipt(sha: string, { channel = 'stable', stateRoot = VALIDATOR_STATE_ROOT, docker = ownerDocker }: { channel?: ValidatorChannel; stateRoot?: string; docker?: DockerCommand } = {}): ValidatorReceipt | null {
  const path = validatorReceiptPath(sha, channel, stateRoot)
  if (!existsSync(path)) return null
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077) throw new Error(`Validator receipt ${path} must be an owner-private regular file`)
  const value = object(JSON.parse(readFileSync(path, 'utf8')))
  if (Object.keys(value).sort().join(',') !== RECEIPT_KEYS.join(',') || value.format !== 1 || value.kind !== 'owner-validator-image' || value.sourceSha !== sha
    || value.channel !== channel || value.platform !== VALIDATOR_PLATFORM || typeof value.imageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.imageId)
    || typeof value.producerSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.producerSha)) throw new Error(`Invalid validator receipt ${path}`)
  let inspected: unknown
  try { inspected = JSON.parse(docker(['image', 'inspect', value.imageId])) } catch { return null }
  const image = Array.isArray(inspected) && inspected.length === 1 ? object(inspected[0]) : {}, labels = object(object(image.Config ?? {}).Labels ?? {})
  if (image.Id !== value.imageId || image.Os !== 'linux' || image.Architecture !== 'arm64' || labels['org.opencontainers.image.revision'] !== sha
    || labels['io.open-agricola.release-channel'] !== channel) throw new Error(`Local validator image ${value.imageId} differs from its receipt`)
  return value as unknown as ValidatorReceipt
}

const git = (args: string[], cwd = policyRoot) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/**
 * The tracked build context, as the GitHub producer prepares it: archived by trusted Git into the fresh owner-private
 * run directory, never through a path the candidate tree controls, then placed into the trusted checkout that the
 * isolation copies to the candidate. A tree that tracks `context.tar` is refused, and the placement never follows or
 * replaces an existing path.
 */
export function prepareValidatorContext(output: string, source: string, sha: string): string {
  fullSha(sha)
  if (git(['ls-tree', '--name-only', sha, '--', 'context.tar'], source)) throw new Error('The candidate tree contains context.tar, which the validator build reserves for its build context')
  const archive = join(output, 'context.tar')
  git(['archive', '--format=tar', '--output', archive, sha], source)
  const info = lstatSync(archive)
  if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error('Tracked image context exceeds the bounded producer input')
  const target = join(source, 'context.tar')
  copyFileSync(archive, target, constants.COPYFILE_EXCL); chmodSync(target, 0o600)
  return target
}

/**
 * The validator image for `sha`: the recorded one while the owner's Docker still holds it, otherwise a fresh isolated
 * build from the trusted protected-main checkout, which takes the owner-local lock for its duration.
 */
export async function ensureValidatorImage(sha: string, { channel = 'stable', rebuild = false, stateRoot = VALIDATOR_STATE_ROOT }: { channel?: ValidatorChannel; rebuild?: boolean; stateRoot?: string } = {}): Promise<ValidatorReceipt> {
  ownerMachine()
  fullSha(sha); channelOf(channel)
  if (!rebuild) { const existing = validatorReceipt(sha, { channel, stateRoot }); if (existing) return existing }
  const ownerUid = process.getuid?.() ?? 0
  if (ownerUid === 0 || ownerUid === UID) throw new Error('Build the validator image as the owner, not as root or the candidate')
  if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('The trusted policy checkout has tracked edits')
  const producerSha = git(['rev-parse', 'HEAD'])
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: policyRoot }).status !== 0) git(['fetch', '--no-tags', '--quiet', 'origin', sha])
  assertPrivateHome(homedir())
  assertNoReservedCandidatePaths(git(['ls-tree', '--name-only', sha, '--', 'data']))
  const release = acquireOwnerLocalLock()
  try {
    mkdirSync(join(stateRoot, 'runs'), { recursive: true, mode: 0o700 }); chmodSync(stateRoot, 0o700)
    const output = join(stateRoot, 'runs', `${sha}-${channel}-${new Date().toISOString().replace(/[-:.]/g, '')}`)
    for (const directory of [output, join(output, 'logs')]) mkdirSync(directory, { mode: 0o700 })
    prepareValidatorContext(output, checkoutTrustedSource(output, sha), sha)
    const receipt = await buildValidatorImage({ sha, channel, producerSha, output, ownerUid, ownerHome: homedir(),
      publicAssets: trustedPublicAssets(git(['show', `${sha}:public-assets.ref`])), node: OWNER_LOCAL_NODE, stateRoot }, nativeRunner, ownerDocker)
    // The loaded image is the validator; the uncompressed archives are not kept beside their digests.
    for (const name of ['image.tar', 'context.tar']) rmSync(join(output, name), { force: true })
    return receipt
  } finally { release() }
}

function option(args: string[], name: string, fallback?: string): string {
  const index = args.indexOf(name), value = index >= 0 ? args[index + 1] : fallback
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing ${name}`)
  return value
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...args] = process.argv.slice(2)
    const sha = fullSha(option(args, '--sha')), channel = channelOf(option(args, '--channel', 'stable'))
    if (mode === 'build') console.log(JSON.stringify(await ensureValidatorImage(sha, { channel, rebuild: args.includes('--rebuild') })))
    else if (mode === 'show') {
      const receipt = validatorReceipt(sha, { channel })
      if (!receipt) throw new Error(`No local validator image for ${sha} (${channel}); run build`)
      console.log(JSON.stringify(receipt))
    } else throw new Error('Usage: validator-image.ts build|show --sha <full-sha> [--channel stable|prerelease] [--rebuild]')
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
