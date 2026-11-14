import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertMainProtection, assertRawCommit, checkCandidateVerification, mainCommit } from '../ci/candidate-verification.ts'
import { checkPrereleaseVerification } from '../ci/prerelease-verification.ts'
import { FULL_TASK_IDS, fullSha, verificationConfiguration, type FullTaskId } from '../ci/verification-tasks.ts'
import { github, ownerMachine, RELEASE_REPOSITORY } from './candidate.ts'
import { parseOwnerLocalProof, parsePrereleaseOwnerLocalProof, type OwnerLocalProof, type PrereleaseOwnerLocalProof } from '../ci/owner-local-verification.ts'

export const CONTAINER_IMAGE_WORKFLOW = '.github/workflows/container-image-build.yml'
export const CONTAINER_IMAGE_REGISTRY = 'ghcr.io/titanxxh/open-agricola-images'
export const CONTAINER_IMAGE_RECEIPT_FILE = 'container-image-receipt.json'
export type ContainerImagePurpose = 'candidate' | 'formal-candidate' | 'trusted-policy'
type CandidateImageVerification = {
  configuration: string; producerConfiguration: string
  tasks: { id: FullTaskId; runId: number; jobId: number; runAttempt: number }[]
}
export type ImageVerification = (CandidateImageVerification & { kind: 'prerelease' })
  | (CandidateImageVerification & { kind: 'stable' })
  | OwnerLocalProof
  | PrereleaseOwnerLocalProof
  | { kind: 'main-policy'; configuration: string }

type ImageIdentity = {
  format: 1; repository: typeof RELEASE_REPOSITORY; repositoryId: number
  sourceSha: string; producerSha: string; platform: 'linux/amd64'
  registryRepository: typeof CONTAINER_IMAGE_REGISTRY; manifestDigest: string; imageId: string
  build: { runId: number; runAttempt: number }
}
export type ContainerImageReceipt = ImageIdentity & (
  { purpose: 'candidate'; channel: 'prerelease'; verification: Extract<ImageVerification, { kind: 'prerelease' | 'owner-local-prerelease' }> }
  | { purpose: 'formal-candidate'; channel: 'stable'; verification: Extract<ImageVerification, { kind: 'stable' | 'owner-local' }> }
  | { purpose: 'trusted-policy'; channel: 'stable'; verification: Extract<ImageVerification, { kind: 'main-policy' }> }
)
export type ContainerImageTransfer = { format: 1; receipt: ContainerImageReceipt; archive: { sha256: string; bytes: number } }
export type ExpectedContainerImage = { purpose: ContainerImagePurpose; sourceSha: string; producerSha: string }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid container image receipt object')
  return Object.fromEntries(Object.entries(value))
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) throw new Error('Unexpected container image receipt fields')
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid container image receipt text')
  return value
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid container image receipt identifier')
  return value
}
function hash(value: unknown): string {
  const result = text(value)
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('Invalid container image hash')
  return result
}
function digest(value: unknown): string {
  const result = text(value)
  if (!/^sha256:[a-f0-9]{64}$/.test(result)) throw new Error('Invalid container image digest')
  return result
}

export function parseContainerImageReceipt(value: unknown): ContainerImageReceipt {
  const input = record(value)
  keys(input, ['format', 'repository', 'repositoryId', 'purpose', 'channel', 'sourceSha', 'producerSha', 'platform', 'registryRepository', 'manifestDigest', 'imageId', 'build', 'verification'])
  if (input.format !== 1 || input.repository !== RELEASE_REPOSITORY || input.platform !== 'linux/amd64'
    || input.registryRepository !== CONTAINER_IMAGE_REGISTRY) throw new Error('Unexpected image repository, platform or receipt version')
  const build = record(input.build); keys(build, ['runId', 'runAttempt'])
  const common: ImageIdentity = { format: 1, repository: RELEASE_REPOSITORY, repositoryId: integer(input.repositoryId),
    sourceSha: fullSha(text(input.sourceSha)), producerSha: fullSha(text(input.producerSha)), platform: 'linux/amd64',
    registryRepository: CONTAINER_IMAGE_REGISTRY, manifestDigest: digest(input.manifestDigest), imageId: digest(input.imageId),
    build: { runId: integer(build.runId), runAttempt: integer(build.runAttempt) } }
  const verification = record(input.verification)
  if (input.purpose === 'formal-candidate' && input.channel === 'stable' && verification.kind === 'owner-local') {
    return { ...common, purpose: 'formal-candidate', channel: 'stable', verification: parseOwnerLocalProof(verification) }
  }
  if (input.purpose === 'candidate' && input.channel === 'prerelease' && verification.kind === 'owner-local-prerelease') {
    return { ...common, purpose: 'candidate', channel: 'prerelease', verification: parsePrereleaseOwnerLocalProof(verification) }
  }
  if (input.purpose === 'trusted-policy' && input.channel === 'stable' && verification.kind === 'main-policy') {
    keys(verification, ['kind', 'configuration'])
    if (common.sourceSha !== common.producerSha) throw new Error('Trusted policy source must be its fixed main producer')
    return { ...common, purpose: 'trusted-policy', channel: 'stable', verification: { kind: 'main-policy', configuration: hash(verification.configuration) } }
  }
  const formal = input.purpose === 'formal-candidate' && input.channel === 'stable' && verification.kind === 'stable'
  if (!formal && (input.purpose !== 'candidate' || input.channel !== 'prerelease' || verification.kind !== 'prerelease')) throw new Error('Image purpose and channel do not match')
  keys(verification, ['kind', 'configuration', 'producerConfiguration', 'tasks'])
  if (!Array.isArray(verification.tasks)) throw new Error('Candidate verification tasks are missing')
  const tasks = verification.tasks.map(value => {
    const task = record(value); keys(task, ['id', 'runId', 'jobId', 'runAttempt'])
    const id = FULL_TASK_IDS.find(id => id === task.id)
    if (!id) throw new Error('Unknown candidate verification task')
    return { id, runId: integer(task.runId), jobId: integer(task.jobId), runAttempt: integer(task.runAttempt) }
  }).sort((a, b) => a.id.localeCompare(b.id))
  if (tasks.length !== FULL_TASK_IDS.length || new Set(tasks.map(task => task.id)).size !== FULL_TASK_IDS.length) throw new Error('Complete candidate verification is required')
  const proof = { configuration: hash(verification.configuration), producerConfiguration: hash(verification.producerConfiguration), tasks }
  return formal
    ? { ...common, purpose: 'formal-candidate', channel: 'stable', verification: { ...proof, kind: 'stable' } }
    : { ...common, purpose: 'candidate', channel: 'prerelease', verification: { ...proof, kind: 'prerelease' } }
}

export function containerImageArtifactName(runId: number, runAttempt: number): string {
  return `container-image-receipt-${integer(runId)}-${integer(runAttempt)}`
}

export function parseContainerImageTransfer(value: unknown): ContainerImageTransfer {
  const input = record(value); keys(input, ['format', 'receipt', 'archive'])
  if (input.format !== 1) throw new Error('Invalid image transfer version')
  const archive = record(input.archive); keys(archive, ['sha256', 'bytes'])
  return { format: 1, receipt: parseContainerImageReceipt(input.receipt), archive: { sha256: hash(archive.sha256), bytes: integer(archive.bytes) } }
}

export function assertExpectedContainerImage(receipt: ContainerImageReceipt, expected: ExpectedContainerImage): void {
  if (receipt.purpose !== expected.purpose || receipt.sourceSha !== expected.sourceSha || receipt.producerSha !== expected.producerSha) throw new Error('Imported image differs from the fixed source or policy')
}

function trustedProducer(cwd: string, producer: string): { repositoryId: number; main: string } {
  fullSha(producer)
  const repository = record(github(RELEASE_REPOSITORY, '')), main = mainCommit(RELEASE_REPOSITORY)
  if (repository.full_name !== RELEASE_REPOSITORY || repository.default_branch !== 'main') throw new Error('Unexpected producer repository')
  assertMainProtection(RELEASE_REPOSITORY)
  assertRawCommit(cwd, RELEASE_REPOSITORY, main); assertRawCommit(cwd, RELEASE_REPOSITORY, producer)
  if (spawnSync('git', ['merge-base', '--is-ancestor', producer, main], { cwd, stdio: 'ignore' }).status !== 0
    || verificationConfiguration(cwd, producer) !== verificationConfiguration(cwd, main)
    || spawnSync('git', ['diff', '--quiet', producer, main, '--', CONTAINER_IMAGE_WORKFLOW, ':(glob)scripts/release/container-images*.ts',
      ':(glob)scripts/release/backend-*', 'scripts/image-intake.ts', 'deploy-backend.sh', 'docker-compose.prod.yml',
      'scripts/backup-storage.sh', 'scripts/backup-process.sh', 'scripts/backup-files.mjs'], { cwd, stdio: 'ignore' }).status !== 0) {
    throw new Error('Image producer is not compatible protected main')
  }
  return { repositoryId: integer(repository.id), main }
}

export function containerImageVerification({ cwd, purpose, sourceSha, producerSha }: {
  cwd: string; purpose: ContainerImagePurpose; sourceSha: string; producerSha: string
}): ImageVerification {
  fullSha(sourceSha); trustedProducer(cwd, producerSha)
  if (purpose === 'trusted-policy') {
    if (sourceSha !== producerSha) throw new Error('Trusted policy source must equal the main producer')
    return { kind: 'main-policy', configuration: verificationConfiguration(cwd, producerSha) }
  }
  const verified = purpose === 'formal-candidate'
    ? checkCandidateVerification(cwd, RELEASE_REPOSITORY, sourceSha)
    : checkPrereleaseVerification(cwd, RELEASE_REPOSITORY, sourceSha)
  if (verified.status !== 'passed') throw new Error(`Complete current ${purpose === 'formal-candidate' ? 'stable' : 'prerelease'} verification is required before image use`)
  if ('ownerLocal' in verified && verified.ownerLocal) return verified.ownerLocal
  const tasks = verified.tasks.map(task => {
    if (task.status !== 'passed' || task.runId === null || task.jobId === null) throw new Error('Incomplete candidate verification')
    const job = record(github(RELEASE_REPOSITORY, `actions/jobs/${task.jobId}`))
    if (job.id !== task.jobId || job.run_id !== task.runId || job.status !== 'completed' || job.conclusion !== 'success') throw new Error('Candidate task attempt changed')
    return { id: task.id, runId: task.runId, jobId: task.jobId, runAttempt: integer(job.run_attempt) }
  }).sort((a, b) => a.id.localeCompare(b.id))
  const proof = { configuration: verified.configuration, producerConfiguration: verificationConfiguration(cwd, producerSha), tasks }
  return purpose === 'formal-candidate' ? { ...proof, kind: 'stable' } : { ...proof, kind: 'prerelease' }
}

const verifiedImage = Symbol('GitHub verified container image')
export type VerifiedContainerImageReceipt = ContainerImageReceipt & { readonly [verifiedImage]: true }

export function verifyContainerImageBuild({ cwd, runId, runAttempt, artifactId }: {
  cwd: string; runId: number; runAttempt: number; artifactId: number
}): VerifiedContainerImageReceipt {
  ownerMachine(); integer(runId); integer(runAttempt); integer(artifactId)
  const workflow = record(github(RELEASE_REPOSITORY, 'actions/workflows/container-image-build.yml'))
  const run = record(github(RELEASE_REPOSITORY, `actions/runs/${runId}/attempts/${runAttempt}`))
  if (workflow.path !== CONTAINER_IMAGE_WORKFLOW || run.id !== runId || run.run_attempt !== runAttempt
    || run.workflow_id !== integer(workflow.id) || run.path !== CONTAINER_IMAGE_WORKFLOW || run.event !== 'workflow_dispatch'
    || run.head_branch !== 'main' || run.status !== 'completed' || run.conclusion !== 'success') throw new Error('Expected a successful fixed main image workflow attempt')
  const producer = fullSha(text(run.head_sha)), authority = trustedProducer(cwd, producer)
  for (const value of [run.repository, run.head_repository]) {
    const repository = record(value)
    if (repository.id !== authority.repositoryId || repository.full_name !== RELEASE_REPOSITORY) throw new Error('Image workflow repository identity differs')
  }
  const artifact = record(github(RELEASE_REPOSITORY, `actions/artifacts/${artifactId}`)), origin = record(artifact.workflow_run)
  const start = Date.parse(text(run.run_started_at)), end = Date.parse(text(run.updated_at)), created = Date.parse(text(artifact.created_at))
  if (artifact.id !== artifactId || artifact.name !== containerImageArtifactName(runId, runAttempt) || artifact.expired !== false
    || integer(artifact.size_in_bytes) > 1024 * 1024 || origin.id !== runId || origin.head_sha !== producer || origin.head_branch !== 'main'
    || origin.repository_id !== authority.repositoryId || origin.head_repository_id !== authority.repositoryId
    || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(created) || created < start || created > end) throw new Error('Image receipt artifact is not from the selected attempt')
  const archive = execFileSync('gh', ['api', `repos/${RELEASE_REPOSITORY}/actions/artifacts/${artifactId}/zip`],
    { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, timeout: 30_000 })
  if (`sha256:${createHash('sha256').update(archive).digest('hex')}` !== digest(artifact.digest)
    || archive.length !== artifact.size_in_bytes) throw new Error('GitHub image receipt artifact digest or size differs')
  const directory = mkdtempSync(join(tmpdir(), 'oa-image-receipt-'))
  try {
    const path = join(directory, 'receipt.zip'); writeFileSync(path, archive, { mode: 0o600 })
    const entries = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8', maxBuffer: 4096, timeout: 5000 }).trim()
    if (entries !== CONTAINER_IMAGE_RECEIPT_FILE) throw new Error('Only the image receipt may be in the public artifact')
    const receipt = parseContainerImageReceipt(JSON.parse(execFileSync('unzip', ['-p', path, CONTAINER_IMAGE_RECEIPT_FILE],
      { encoding: 'utf8', maxBuffer: 128 * 1024, timeout: 5000 })))
    if (receipt.repositoryId !== authority.repositoryId || receipt.producerSha !== producer || receipt.build.runId !== runId || receipt.build.runAttempt !== runAttempt) throw new Error('Image receipt differs from its native GitHub provenance')
    const verification = containerImageVerification({ cwd, purpose: receipt.purpose, sourceSha: receipt.sourceSha, producerSha: producer })
    if (JSON.stringify(verification) !== JSON.stringify(receipt.verification)) throw new Error('Image verification is incomplete, stale or incompatible')
    return { ...receipt, [verifiedImage]: true }
  } finally { rmSync(directory, { force: true, recursive: true }) }
}

export function assertVerifiedContainerImageReceipt(receipt: VerifiedContainerImageReceipt): void {
  if (receipt[verifiedImage] !== true) throw new Error('Read the image receipt from its verified GitHub artifact before pulling it')
}
