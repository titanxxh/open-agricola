import { FULL_TASK_IDS, fullSha, type FullTaskId, type VerificationCommand } from './verification-tasks.ts'

// The owner-local receipt and authorization formats: the stable format 1 and prerelease format 2 receipts the owner
// uploads, the status context and asset names that publish them, and the proof a passed check returns.

export const OWNER_LOCAL_CONTEXT = 'owner-local-verification'
export const PRERELEASE_OWNER_LOCAL_CONTEXT = 'owner-local-prerelease-verification'
export const OWNER_LOCAL_ASSET = 'owner-local-verification.json'
export type OwnerLocalProof = {
  kind: 'owner-local'; configuration: string; producerConfiguration: string; receiptSha256: string
  statusId: number; releaseId: number; assetId: number; ownerId: number; url: string
}
export type PrereleaseOwnerLocalProof = Omit<OwnerLocalProof, 'kind'> & { kind: 'owner-local-prerelease'; executionEvidenceSha256: string }
export type LocalProof = OwnerLocalProof | PrereleaseOwnerLocalProof
type LocalCommand = VerificationCommand & { exitCode: number; logSha256: string }
export type OwnerLocalReceipt = {
  format: 1; kind: 'owner-local-verification'; repository: string; repositoryId: number
  testedSha: string; candidateSha: string; tree: string; configuration: string; producerConfiguration: string
  startedAt: string; completedAt: string
  environment: { node: string; platform: string; arch: string; nodeExecutable: string }
  tasks: { id: FullTaskId; startedAt: string; completedAt: string; commands: LocalCommand[] }[]
}
export type PrereleaseOwnerLocalReceipt = Omit<OwnerLocalReceipt, 'kind' | 'format'> & {
  format: 2; kind: typeof PRERELEASE_OWNER_LOCAL_CONTEXT; channel: 'prerelease'; producerSha: string
  execution: { kind: 'docker-isolated'; evidenceSha256: string }
}
export type LocalReceipt = OwnerLocalReceipt | PrereleaseOwnerLocalReceipt

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner-local evidence object')
  return Object.fromEntries(Object.entries(value))
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) throw new Error('Unexpected owner-local evidence fields')
}
const text = (value: unknown): string => { if (typeof value !== 'string' || !value) throw new Error('Invalid owner-local evidence text'); return value }
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid owner-local native identity')
  return value
}
const hash = (value: unknown): string => { const result = text(value); if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('Invalid owner-local digest'); return result }
const time = (value: unknown): number => {
  const result = Date.parse(text(value))
  if (!Number.isFinite(result) || result > Date.now() + 60_000) throw new Error('Invalid owner-local execution time')
  return result
}

/** Parses an uploaded receipt of either format; it says nothing yet about the candidate it names. */
export function parseOwnerLocalReceipt(value: unknown): LocalReceipt {
  const input = object(value)
  const prerelease = input.kind === PRERELEASE_OWNER_LOCAL_CONTEXT
  keys(input, ['format', 'kind', 'repository', 'repositoryId', 'testedSha', 'candidateSha', 'tree', 'configuration', 'producerConfiguration', 'startedAt', 'completedAt', 'environment', 'tasks', ...(prerelease ? ['channel', 'producerSha', 'execution'] : [])])
  if (input.format !== (prerelease ? 2 : 1) || !prerelease && input.kind !== OWNER_LOCAL_CONTEXT) throw new Error('Invalid owner-local receipt version')
  const repository = text(input.repository)
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid owner-local repository')
  const startedAt = text(input.startedAt), completedAt = text(input.completedAt)
  if (time(completedAt) < time(startedAt)) throw new Error('Owner-local completion precedes execution')
  const environment = object(input.environment); keys(environment, ['node', 'platform', 'arch', 'nodeExecutable'])
  const node = text(environment.node), version = /^v(\d+)\.(\d+)\.(\d+)$/.exec(node)
  if (!version || !(Number(version[1]) === 24 && Number(version[2]) >= 15 || Number(version[1]) >= 26)) throw new Error('Owner-local verification requires supported Node')
  const platform = text(environment.platform), arch = text(environment.arch), nodeExecutable = text(environment.nodeExecutable)
  if (!['linux', 'darwin'].includes(platform) || !['arm64', 'x64'].includes(arch) || !nodeExecutable.startsWith('/') || /[\r\n\0]/.test(nodeExecutable)) throw new Error('Invalid owner-local execution environment')
  if (!Array.isArray(input.tasks)) throw new Error('Owner-local tasks are missing')
  const tasks = input.tasks.map(value => {
    const task = object(value); keys(task, ['id', 'startedAt', 'completedAt', 'commands'])
    const id = FULL_TASK_IDS.find(id => id === task.id)
    if (!id || !Array.isArray(task.commands)) throw new Error('Invalid owner-local task')
    const taskStart = text(task.startedAt), taskEnd = text(task.completedAt)
    if (time(taskStart) < time(startedAt) || time(taskEnd) > time(completedAt) || time(taskEnd) < time(taskStart)) throw new Error('Owner-local task lies outside its execution interval')
    const commands = task.commands.map(value => {
      const command = object(value); keys(command, ['command', 'args', 'exitCode', 'logSha256'])
      if (command.exitCode !== 0 || !Array.isArray(command.args) || !command.args.every(arg => typeof arg === 'string')) throw new Error('Owner-local command did not succeed')
      return { command: text(command.command), args: command.args.map(text), exitCode: 0, logSha256: hash(command.logSha256) }
    })
    return { id, startedAt: taskStart, completedAt: taskEnd, commands }
  })
  if (tasks.length !== FULL_TASK_IDS.length || tasks.map(task => task.id).join(',') !== FULL_TASK_IDS.join(',')) throw new Error('Complete canonical owner-local tasks are required exactly once')
  const receipt: OwnerLocalReceipt = { format: 1, kind: OWNER_LOCAL_CONTEXT, repository, repositoryId: integer(input.repositoryId), testedSha: fullSha(text(input.testedSha)),
    candidateSha: fullSha(text(input.candidateSha)), tree: fullSha(text(input.tree)), configuration: hash(input.configuration), producerConfiguration: hash(input.producerConfiguration),
    startedAt, completedAt, environment: { node, platform, arch, nodeExecutable }, tasks }
  if (!prerelease) return receipt
  if (input.channel !== 'prerelease') throw new Error('Owner-local receipt channel differs')
  const execution = object(input.execution)
  keys(execution, ['kind', 'evidenceSha256'])
  if (execution.kind !== 'docker-isolated') throw new Error('Prerelease local verification requires isolated Docker execution evidence')
  return { ...receipt, format: 2, kind: PRERELEASE_OWNER_LOCAL_CONTEXT, channel: 'prerelease', producerSha: fullSha(text(input.producerSha)),
    execution: { kind: 'docker-isolated', evidenceSha256: hash(execution.evidenceSha256) } }
}

function parseLocalProof(value: unknown, channel: 'stable' | 'prerelease'): LocalProof {
  const input = object(value)
  keys(input, ['kind', 'configuration', 'producerConfiguration', 'receiptSha256', 'statusId', 'releaseId', 'assetId', 'ownerId', 'url',
    ...(channel === 'prerelease' ? ['executionEvidenceSha256'] : [])])
  const url = text(input.url)
  const kind = channel === 'stable' ? 'owner-local' : 'owner-local-prerelease'
  const pattern = channel === 'stable'
    ? /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/v\d+\.\d+\.\d+\/owner-local-verification\.json$/
    : /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/v\d+\.\d+\.\d+-beta\.[1-9]\d*\/owner-local-verification\.json$/
  if (input.kind !== kind || !pattern.test(url)) throw new Error('Invalid owner-local authorization reference')
  const proof: OwnerLocalProof = { kind: 'owner-local', configuration: hash(input.configuration), producerConfiguration: hash(input.producerConfiguration), receiptSha256: hash(input.receiptSha256),
    statusId: integer(input.statusId), releaseId: integer(input.releaseId), assetId: integer(input.assetId), ownerId: integer(input.ownerId), url }
  return channel === 'stable' ? proof : { ...proof, kind: 'owner-local-prerelease', executionEvidenceSha256: hash(input.executionEvidenceSha256) }
}

export function parseOwnerLocalProof(value: unknown): OwnerLocalProof {
  const proof = parseLocalProof(value, 'stable')
  if (proof.kind !== 'owner-local') throw new Error('Expected stable owner-local proof')
  return proof
}
export function parsePrereleaseOwnerLocalProof(value: unknown): PrereleaseOwnerLocalProof {
  const proof = parseLocalProof(value, 'prerelease')
  if (proof.kind !== 'owner-local-prerelease') throw new Error('Expected prerelease owner-local proof')
  return proof
}
