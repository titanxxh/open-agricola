import { fullSha } from './verification-tasks.ts'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCandidateCheckout } from './candidate-verification.ts'
import { candidateExecution, executeCandidate, printVerificationOutput, stopCandidateExecution } from './candidate-isolation.ts'
import { CONTAINER_IMAGE_REGISTRY, CONTAINER_IMAGE_RECEIPT_FILE, CONTAINER_IMAGE_WORKFLOW, containerImageVerification, parseContainerImageReceipt } from '../release/container-images.ts'
import { checkPrivateRegistry, assertPrivateReadDenials, publishedRegistryManifest } from './container-image-build-registry.ts'
import { nativeContainerImageId, validateContainerImageArchive } from '../release/container-images-archive.ts'

const repository = 'titanxxh/open-agricola'
const workflow = CONTAINER_IMAGE_WORKFLOW
const builderImage = 'moby/buildkit@sha256:97719ccb2ac86fb44fd36f330a6d302f63dddd5326f3ada24f9c05ccac0d9098'
const maxImageBytes = 4 * 1024 * 1024 * 1024

function command(program: string, args: string[], options: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): string {
  return execFileSync(program, args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim()
}

function privateRoot(): string {
  if (process.env.RUNNER_TEMP !== '/home/runner/work/_temp') throw new Error('Image producer requires the disposable GitHub runner directory')
  return join(process.env.RUNNER_TEMP, 'container-image')
}

function readRequest() {
  const value = imageObject(JSON.parse(readFileSync(join(privateRoot(), 'request.json'), 'utf8')))
  if (typeof value.purpose !== 'string' || typeof value.sourceSha !== 'string') throw new Error('Missing prepared image request')
  return imageBuildRequest({ purpose: value.purpose, sourceSha: value.sourceSha })
}

function dockerEnvironment(directory: string): NodeJS.ProcessEnv {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, LANG: 'C.UTF-8', DOCKER_CONFIG: directory }
}

export function assertImageBuildStopped(): void {
  const account = spawnSync('getent', ['passwd', 'oa-candidate'], { stdio: 'ignore' })
  if (account.error || account.status !== 2) throw new Error('Candidate account has not been removed; publishing is forbidden')
  const events = '/sys/fs/cgroup/user.slice/user-61000.slice/cgroup.events'
  if (existsSync(events) && !readFileSync(events, 'utf8').split('\n').includes('populated 0')) throw new Error('Candidate cgroup remains populated; publishing is forbidden')
}

export function cleanupImageBuild(): void {
  const account = spawnSync('getent', ['passwd', 'oa-candidate'], { stdio: 'ignore' })
  if (account.status === 0) stopCandidateExecution()
  assertImageBuildStopped()
}

export function verifyPublishEnvironment(value: unknown, branches: unknown): void {
  const environment = imageObject(value), policy = imageObject(environment.deployment_branch_policy)
  const selected = imageObject(branches).branch_policies
  if (environment.name !== 'prerelease-image-publish' || policy.custom_branch_policies !== true || policy.protected_branches !== false
    || !Array.isArray(selected) || selected.length !== 1 || imageObject(selected[0]).name !== 'main' || imageObject(selected[0]).type !== 'branch') {
    throw new Error('Configure prerelease-image-publish with the exact main branch before publishing')
  }
}

export function prepareImageBuild(policy: string, source: string, input: { purpose: string; sourceSha: string }): void {
  const request = imageBuildRequest(input)
  assertCandidateCheckout(policy, request.producerSha, request.producerSha)
  assertCandidateCheckout(source, request.sourceSha, request.producerSha)
  const endpoint = `repos/${repository}/environments/prerelease-image-publish`
  verifyPublishEnvironment(JSON.parse(command('gh', ['api', endpoint])), JSON.parse(command('gh', ['api', `${endpoint}/deployment-branch-policies?per_page=100`])))
  containerImageVerification({ cwd: policy, purpose: request.purpose, sourceSha: request.sourceSha, producerSha: request.producerSha })
  const root = privateRoot(), payload = join(root, 'payload')
  mkdirSync(root, { mode: 0o700 }); mkdirSync(payload, { mode: 0o700 })
  writeFileSync(join(root, 'request.json'), JSON.stringify({ purpose: request.purpose, sourceSha: request.sourceSha }), { mode: 0o600, flag: 'wx' })
  command('git', ['archive', '--format=tar', '--output', join(payload, 'context.tar'), request.sourceSha], { cwd: source })
  if (lstatSync(join(payload, 'context.tar')).size > 256 * 1024 * 1024) throw new Error('Tracked image context exceeds the bounded producer input')
}

export function buildIsolatedImage(): void {
  if (process.env.GHCR_PUBLISH_TOKEN || process.env.DOCKER_AUTH_CONFIG) throw new Error('Registry credentials must not exist during candidate execution')
  const request = readRequest(), execution = candidateExecution()
  command('sudo', ['-n', 'systemctl', 'set-property', '--runtime', 'user-61000.slice', 'MemoryMax=6G', 'MemorySwapMax=0', 'CPUQuota=200%', 'TasksMax=768'])
  const limits = command('systemctl', ['show', 'user-61000.slice', '-p', 'MemoryMax', '-p', 'MemorySwapMax', '-p', 'CPUQuotaPerSecUSec', '-p', 'TasksMax']).split('\n')
  if (!['MemoryMax=6442450944', 'MemorySwapMax=0', 'CPUQuotaPerSecUSec=2s', 'TasksMax=768'].every(limit => limits.includes(limit))) throw new Error('Image build cgroup limits were not applied')
  const script = [
    `docker buildx create --name oa-image --driver docker-container --driver-opt image=${builderImage},memory=4g,memory-swap=4g,cpu-quota=200000,cpu-period=100000 --use`,
    'docker buildx inspect --bootstrap oa-image',
    `docker buildx build --builder oa-image --platform linux/amd64 --provenance=false --sbom=false --metadata-file image-metadata.json --output type=docker,dest=image.tar,compression=uncompressed,force-compression=true --tag oa-container-image:${request.sourceSha} --build-arg GAME_BUILD_ID=${request.sourceSha} --build-arg RELEASE_CHANNEL=${request.channel} - < context.tar`,
  ].join('\n')
  try {
    if (executeCandidate(execution, '/usr/bin/timeout', ['--signal=TERM', '--kill-after=10s', '1800', '/bin/bash', '-euo', 'pipefail', '-c', script], 'image-build') !== 0) {
      throw new Error('Isolated image build failed; no image was published')
    }
  } finally { cleanupImageBuild() }
  for (const [name, maximum] of [['image.tar', maxImageBytes], ['image-metadata.json', 65536]] satisfies [string, number][]) {
    const source = join(execution.work, name), metadata = lstatSync(source)
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size <= 0 || metadata.size > maximum) throw new Error('Untrusted image output file')
    copyFileSync(source, join(privateRoot(), name)); chmodSync(join(privateRoot(), name), 0o600)
  }
}

export function verifyBuiltImage(): string {
  assertImageBuildStopped()
  const request = readRequest(), root = privateRoot(), env = dockerEnvironment(join(root, 'verify-docker'))
  const metadata = imageObject(JSON.parse(readFileSync(join(root, 'image-metadata.json'), 'utf8')))
  const imageId = metadata['containerimage.config.digest']
  if (typeof imageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('BuildKit did not identify the image config digest')
  // Archive structure is checked before native Docker accepts any candidate-selected tags.
  const archive = validateContainerImageArchive({ archivePath: join(root, 'image.tar'), imageId, sourceSha: request.sourceSha, channel: request.channel,
    maxBytes: maxImageBytes, allowProducerTag: true })
  const nativeImageId = nativeContainerImageId({ configDigest: imageId, manifestDigest: archive.archiveManifestDigest }, args => command('docker', args, { env }))
  command('docker', ['load', '--input', join(root, 'image.tar')], { env, timeout: 180_000 })
  if (inspectPublishableImage(JSON.parse(command('docker', ['image', 'inspect', '--format', '{{json .}}', nativeImageId], { env })), request) !== nativeImageId) throw new Error('Native producer image changed')
  const frontend = imageObject(JSON.parse(command('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '--pids-limit', '64',
    '--entrypoint', 'node', nativeImageId, '-e', 'require("isolated-vm");require("canvas");process.stdout.write(require("node:fs").readFileSync("/app/frontend-dist/frontend-build.json","utf8"))'], { env, timeout: 30_000 })))
  if (frontend.format !== 1 || frontend.gameBuildId !== request.sourceSha || frontend.releaseChannel !== request.channel
    || frontend.deploymentTarget !== `${request.channel}-hosted` || frontend.basePath !== '/open-agricola/') throw new Error('Built hosted frontend differs from the fixed source/channel')
  writeFileSync(join(root, 'verified-image.json'), JSON.stringify({ configDigest: imageId, nativeImageId, archiveManifestDigest: archive.archiveManifestDigest }), { flag: 'wx', mode: 0o600 })
  return imageId
}

export async function publishBuiltImage(policy: string): Promise<void> {
  assertImageBuildStopped()
  const request = readRequest(), root = privateRoot()
  assertCandidateCheckout(policy, request.producerSha, request.producerSha)
  const verification = containerImageVerification({ cwd: policy, purpose: request.purpose, sourceSha: request.sourceSha, producerSha: request.producerSha })
  const verified = imageObject(JSON.parse(readFileSync(join(root, 'verified-image.json'), 'utf8')))
  if (typeof verified.configDigest !== 'string' || typeof verified.nativeImageId !== 'string'
    || verified.archiveManifestDigest !== null && typeof verified.archiveManifestDigest !== 'string') throw new Error('Missing native producer image binding')
  const imageId = verified.configDigest
  const env = dockerEnvironment(join(root, 'publish-docker'))
  const nativeImageId = nativeContainerImageId({ configDigest: imageId, manifestDigest: verified.archiveManifestDigest }, args => command('docker', args, { env }))
  if (nativeImageId !== verified.nativeImageId) throw new Error('Producer image store changed after verification')
  if (inspectPublishableImage(JSON.parse(command('docker', ['image', 'inspect', '--format', '{{json .}}', nativeImageId], { env })), request) !== nativeImageId) throw new Error('Native producer image changed')
  const credentials = { publisher: process.env.GHCR_PUBLISH_USER ?? '', publishToken: process.env.GHCR_PUBLISH_TOKEN ?? '',
    probeToken: process.env.GH_TOKEN ?? '', expectedPackageId: process.env.GHCR_PRIVATE_PACKAGE_ID ?? '' }
  const packageId = await checkPrivateRegistry(credentials)
  const tag = `${request.purpose}-${request.sourceSha}-${request.build.runId}-${request.build.runAttempt}`
  try {
    command('docker', ['login', 'ghcr.io', '--username', credentials.publisher, '--password-stdin'], { env, input: credentials.publishToken })
    command('docker', ['tag', nativeImageId, `${CONTAINER_IMAGE_REGISTRY}:${tag}`], { env })
    command('docker', ['push', `${CONTAINER_IMAGE_REGISTRY}:${tag}`], { env, timeout: 600_000 })
    const manifestDigest = await publishedRegistryManifest(tag, imageId, credentials)
    const publishedPackageId = await checkPrivateRegistry(credentials, packageId === null)
    await assertPrivateReadDenials(manifestDigest, credentials)
    const receipt = parseContainerImageReceipt({ format: 1, ...request, platform: 'linux/amd64',
      registryRepository: CONTAINER_IMAGE_REGISTRY, manifestDigest, imageId, verification })
    const receipts = join(root, 'receipt'); mkdirSync(receipts, { mode: 0o700 })
    writeFileSync(join(receipts, CONTAINER_IMAGE_RECEIPT_FILE), JSON.stringify(receipt) + '\n', { mode: 0o600, flag: 'wx' })
    printVerificationOutput(`Published verified private ${request.purpose} image ${manifestDigest}`)
    if (packageId === null) printVerificationOutput(`Private package created with ID ${publishedPackageId}; complete owner ACL readback and set GHCR_PRIVATE_PACKAGE_ID before the next build`)
  } finally { rmSync(join(root, 'publish-docker'), { recursive: true, force: true }) }
}

const imageObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native image metadata')
  return Object.fromEntries(Object.entries(value))
}

export function inspectPublishableImage(value: unknown, request: ReturnType<typeof imageBuildRequest>): string {
  const image = imageObject(value), labels = imageObject(imageObject(image.Config).Labels)
  if (labels['org.opencontainers.image.source'] !== undefined) throw new Error('Candidate image contains automatic repository linkage')
  if (typeof image.Id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(image.Id) || image.Os !== 'linux' || image.Architecture !== 'amd64'
    || labels['org.opencontainers.image.revision'] !== request.sourceSha || labels['io.open-agricola.release-channel'] !== request.channel) {
    throw new Error('Native image identity differs from the fixed source, channel or platform')
  }
  return image.Id
}

export function imageBuildRequest(input: { purpose: string; sourceSha: string }, env: NodeJS.ProcessEnv = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_OS !== 'Linux' || env.RUNNER_ARCH !== 'X64'
    || env.GITHUB_REPOSITORY !== repository || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA || env.GITHUB_WORKFLOW_REF !== `${repository}/${workflow}@refs/heads/main`) {
    throw new Error('Image production requires the trusted main workflow on a native AMD64 GitHub runner')
  }
  const producerSha = fullSha(env.GITHUB_SHA ?? '')
  const sourceSha = fullSha(input.sourceSha)
  const integer = (value: string | undefined): number => {
    if (!value || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid image workflow identity')
    return Number(value)
  }
  const common = { sourceSha, producerSha, repository, repositoryId: integer(env.GITHUB_REPOSITORY_ID),
    build: { runId: integer(env.GITHUB_RUN_ID), runAttempt: integer(env.GITHUB_RUN_ATTEMPT) } }
  if (input.purpose === 'candidate') return { ...common, purpose: 'candidate' as const, channel: 'prerelease' as const }
  if (input.purpose !== 'trusted-policy' || sourceSha !== producerSha) throw new Error('Trusted policy source must be the main producer; purpose must be candidate or trusted-policy')
  return { ...common, purpose: 'trusted-policy' as const, channel: 'stable' as const }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, purpose, sourceSha, source] = process.argv.slice(2)
    const policy = resolve(import.meta.dirname, '../..')
    if (mode === 'prepare' && purpose && sourceSha && source) prepareImageBuild(policy, resolve(source), { purpose, sourceSha })
    else if (mode === 'build') buildIsolatedImage()
    else if (mode === 'verify') verifyBuiltImage()
    else if (mode === 'publish') await publishBuiltImage(policy)
    else if (mode === 'cleanup') cleanupImageBuild()
    else throw new Error('Usage: container-image-build.ts prepare <candidate|trusted-policy> <SHA> <source-directory> | build | verify | publish | cleanup')
  } catch (error) { printVerificationOutput(error instanceof Error ? error.message : 'Image production failed', 'stderr'); process.exitCode = 1 }
}
