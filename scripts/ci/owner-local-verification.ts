import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FULL_TASK_IDS, fullSha, taskCommands, verificationConfiguration, verificationTask, type FullTaskId, type VerificationCommand } from './verification-tasks.ts'

export const OWNER_LOCAL_CONTEXT = 'owner-local-verification'
export const PRERELEASE_OWNER_LOCAL_CONTEXT = 'owner-local-prerelease-verification'
export const OWNER_LOCAL_ASSET = 'owner-local-verification.json'
export type OwnerLocalProof = {
  kind: 'owner-local'; configuration: string; producerConfiguration: string; receiptSha256: string
  statusId: number; releaseId: number; assetId: number; ownerId: number; url: string
}
export type PrereleaseOwnerLocalProof = Omit<OwnerLocalProof, 'kind'> & { kind: 'owner-local-prerelease' }
type LocalProof = OwnerLocalProof | PrereleaseOwnerLocalProof
type LocalCommand = VerificationCommand & { exitCode: number; logSha256: string }
export type OwnerLocalReceipt = {
  format: 1; kind: 'owner-local-verification'; repository: string; repositoryId: number
  testedSha: string; candidateSha: string; tree: string; configuration: string; producerConfiguration: string
  startedAt: string; completedAt: string
  environment: { node: string; platform: string; arch: string; nodeExecutable: string }
  tasks: { id: FullTaskId; startedAt: string; completedAt: string; commands: LocalCommand[] }[]
}
export type PrereleaseOwnerLocalReceipt = Omit<OwnerLocalReceipt, 'kind'> & {
  kind: typeof PRERELEASE_OWNER_LOCAL_CONTEXT; channel: 'prerelease'; producerSha: string
}
type LocalReceipt = OwnerLocalReceipt | PrereleaseOwnerLocalReceipt
export type OwnerLocalGitHubReader = (endpoint: string, collection?: string) => unknown
export type OwnerLocalSelection = { repository: string; repositoryId: number; candidateSha: string; producerSha: string }

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
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')
const git = (cwd: string, args: string[]): Buffer => execFileSync('git', args, {
  cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
})

function rawTree(cwd: string, sha: string, repository: string): string {
  fullSha(sha)
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: 'ignore' }).status !== 0) {
    git(cwd, ['fetch', '--no-tags', `https://github.com/${repository}.git`, sha])
  }
  const body = git(cwd, ['cat-file', 'commit', sha])
  if (createHash('sha1').update(`commit ${body.length}\0`).update(body).digest('hex') !== sha) throw new Error('Owner-local commit does not match its raw SHA')
  const tree = /^tree ([a-f0-9]{40})\n/.exec(body.toString('utf8'))?.[1]
  if (!tree) throw new Error('Owner-local commit lacks its raw tree')
  return tree
}

export function canonicalOwnerLocalCommands(cwd: string, sha: string, channel: 'stable' | 'prerelease' = 'stable'): Record<FullTaskId, VerificationCommand[]> {
  const root = mkdtempSync(join(tmpdir(), 'oa-local-plan-'))
  try {
    const archive = git(cwd, ['archive', fullSha(sha), 'package.json', 'e2e-tests'])
    execFileSync('tar', ['-x', '-C', root], { input: archive, stdio: ['pipe', 'ignore', 'pipe'] })
    const commands = (id: FullTaskId): VerificationCommand[] => [
      ...(verificationTask(id).services ? [{ command: 'node', args: ['scripts/local-services.mjs', '--test'] }] : []),
      ...taskCommands(root, id).map(command => channel === 'prerelease' && id === 'build' && command.command === 'pnpm'
        && command.args.length === 2 && command.args[0] === 'run' && command.args[1] === 'build' ? { command: 'pnpm', args: ['run', 'build:hosted-frontend'] } : command),
    ]
    return { quality: commands('quality'), fast: commands('fast'), slow: commands('slow'), build: commands('build'),
      'chromium-1': commands('chromium-1'), 'chromium-2': commands('chromium-2'), 'chromium-3': commands('chromium-3'), 'chromium-4': commands('chromium-4'),
      'browser-sandbox': commands('browser-sandbox'), webkit: commands('webkit') }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

function parseReceipt(value: unknown): LocalReceipt {
  const input = object(value)
  const prerelease = input.kind === PRERELEASE_OWNER_LOCAL_CONTEXT
  keys(input, ['format', 'kind', 'repository', 'repositoryId', 'testedSha', 'candidateSha', 'tree', 'configuration', 'producerConfiguration', 'startedAt', 'completedAt', 'environment', 'tasks', ...(prerelease ? ['channel', 'producerSha'] : [])])
  if (input.format !== 1 || !prerelease && input.kind !== OWNER_LOCAL_CONTEXT) throw new Error('Invalid owner-local receipt version')
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
  return { ...receipt, kind: PRERELEASE_OWNER_LOCAL_CONTEXT, channel: 'prerelease', producerSha: fullSha(text(input.producerSha)) }
}

function rebindReceipt(cwd: string, value: unknown, selected: OwnerLocalSelection, channel: 'stable' | 'prerelease'): LocalReceipt {
  const receipt = parseReceipt(value)
  if ((receipt.kind === PRERELEASE_OWNER_LOCAL_CONTEXT) !== (channel === 'prerelease')) throw new Error('Owner-local receipt channel differs')
  if (receipt.kind === PRERELEASE_OWNER_LOCAL_CONTEXT) {
    rawTree(cwd, receipt.producerSha, selected.repository)
    if (spawnSync('git', ['merge-base', '--is-ancestor', receipt.producerSha, selected.producerSha], { cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: 'ignore' }).status !== 0
      || verificationConfiguration(cwd, receipt.producerSha) !== receipt.producerConfiguration) throw new Error('Owner-local receipt producer is not compatible protected main')
  }
  if (receipt.repository !== selected.repository || receipt.repositoryId !== selected.repositoryId
    || receipt.tree !== rawTree(cwd, receipt.testedSha, selected.repository) || receipt.tree !== rawTree(cwd, receipt.candidateSha, selected.repository)
    || receipt.tree !== rawTree(cwd, selected.candidateSha, selected.repository)
    || receipt.configuration !== verificationConfiguration(cwd, receipt.testedSha)
    || receipt.configuration !== verificationConfiguration(cwd, selected.candidateSha)
    || receipt.producerConfiguration !== verificationConfiguration(cwd, selected.producerSha)) throw new Error('Owner-local source tree or verification configuration differs')
  const commands = canonicalOwnerLocalCommands(cwd, receipt.testedSha, channel)
  for (const task of receipt.tasks) {
    if (JSON.stringify(task.commands.map(({ command, args }) => ({ command, args }))) !== JSON.stringify(commands[task.id])) throw new Error(`Owner-local ${task.id} commands differ from the complete candidate plan`)
  }
  return { ...receipt, candidateSha: fullSha(selected.candidateSha) }
}

export function rebindOwnerLocalReceipt(cwd: string, value: unknown, selected: OwnerLocalSelection): OwnerLocalReceipt {
  const receipt = rebindReceipt(cwd, value, selected, 'stable')
  if (receipt.kind !== OWNER_LOCAL_CONTEXT) throw new Error('Expected stable owner-local receipt')
  return receipt
}
export function rebindPrereleaseOwnerLocalReceipt(cwd: string, value: unknown, selected: OwnerLocalSelection): PrereleaseOwnerLocalReceipt {
  const receipt = rebindReceipt(cwd, value, selected, 'prerelease')
  if (receipt.kind !== PRERELEASE_OWNER_LOCAL_CONTEXT) throw new Error('Expected prerelease owner-local receipt')
  return receipt
}

function parseLocalProof(value: unknown, channel: 'stable' | 'prerelease'): LocalProof {
  const input = object(value)
  keys(input, ['kind', 'configuration', 'producerConfiguration', 'receiptSha256', 'statusId', 'releaseId', 'assetId', 'ownerId', 'url'])
  const url = text(input.url)
  const kind = channel === 'stable' ? 'owner-local' : 'owner-local-prerelease'
  const pattern = channel === 'stable'
    ? /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/v\d+\.\d+\.\d+\/owner-local-verification\.json$/
    : /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/v\d+\.\d+\.\d+-beta\.[1-9]\d*\/owner-local-verification\.json$/
  if (input.kind !== kind || !pattern.test(url)) throw new Error('Invalid owner-local authorization reference')
  return { kind, configuration: hash(input.configuration), producerConfiguration: hash(input.producerConfiguration), receiptSha256: hash(input.receiptSha256),
    statusId: integer(input.statusId), releaseId: integer(input.releaseId), assetId: integer(input.assetId), ownerId: integer(input.ownerId), url }
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

export function ownerLocalRepository(value: unknown, repository: string): { repositoryId: number; ownerId: number } {
  const input = object(value), owner = object(input.owner)
  if (input.full_name !== repository || owner.type !== 'User' || owner.login !== repository.split('/')[0]) throw new Error('Owner-local authority requires the native repository User owner')
  return { repositoryId: integer(input.id), ownerId: integer(owner.id) }
}

function tagSha(read: OwnerLocalGitHubReader, prefix: string, tag: string): string {
  let target = object(object(read(`${prefix}/git/ref/tags/${tag}`)).object)
  for (let depth = 0; depth < 10; depth++) {
    const sha = fullSha(text(target.sha))
    if (target.type === 'commit') return sha
    if (target.type !== 'tag') break
    target = object(object(read(`${prefix}/git/tags/${sha}`)).object)
  }
  throw new Error('Owner-local release tag does not identify an immutable commit')
}

type LocalVerificationInput = OwnerLocalSelection & {
  cwd: string; read: OwnerLocalGitHubReader; download: (endpoint: string) => Buffer; draftReleaseId?: number
}
function checkLocalVerification({ cwd, repository, repositoryId, candidateSha, producerSha, read, download, draftReleaseId }: LocalVerificationInput, channel: 'stable' | 'prerelease'): LocalProof | null {
  const prefix = `repos/${repository}`
  let statuses: unknown
  try { statuses = read(`${prefix}/commits/${candidateSha}/statuses?per_page=100`, '[]') } catch { return null }
  if (!Array.isArray(statuses)) throw new Error('Invalid native owner-local statuses')
  const candidates = statuses.map(object).filter(status => status.context === (channel === 'stable' ? OWNER_LOCAL_CONTEXT : PRERELEASE_OWNER_LOCAL_CONTEXT))
  if (!candidates.length) return null
  const authority = ownerLocalRepository(read(prefix), repository)
  if (authority.repositoryId !== repositoryId) throw new Error('Owner-local native repository identity differs')
  const status = candidates.filter(status => status.creator !== null && typeof status.creator === 'object'
    && 'id' in status.creator && status.creator.id === authority.ownerId).sort((a, b) => integer(b.id) - integer(a.id))[0]
  if (!status || status.state !== 'success') return null
  const url = text(status.target_url), marker = /^owner-local sha256:([a-f0-9]{64})$/.exec(text(status.description))
  const expectedPrefix = `https://github.com/${repository}/releases/download/`
  if (!marker || !url.startsWith(expectedPrefix)) throw new Error('Owner-local status must bind its exact native release asset digest')
  const version = url.slice(expectedPrefix.length).split('/')[0]
  const versionPattern = channel === 'stable' ? /^v\d+\.\d+\.\d+$/ : /^v\d+\.\d+\.\d+-beta\.[1-9]\d*$/
  if (!versionPattern.test(version) || url !== `${expectedPrefix}${version}/${OWNER_LOCAL_ASSET}`) throw new Error('Owner-local status target does not match its release channel')
  const release = object(read(draftReleaseId === undefined ? `${prefix}/releases/tags/${version}` : `${prefix}/releases/${integer(draftReleaseId)}`))
  if (draftReleaseId !== undefined && release.id !== draftReleaseId || release.tag_name !== version || release.prerelease !== (channel === 'prerelease')
    || release.draft !== false && !(draftReleaseId !== undefined && release.draft === true)
    || integer(object(release.author).id) !== authority.ownerId || tagSha(read, prefix, version) !== candidateSha || !Array.isArray(release.assets)) throw new Error('Owner-local release identity or publication differs')
  const assets = release.assets.map(object).filter(asset => asset.name === OWNER_LOCAL_ASSET), asset = assets[0]
  if (assets.length !== 1 || !asset || asset.state !== 'uploaded' || asset.browser_download_url !== url
    || integer(object(asset.uploader).id) !== authority.ownerId || integer(asset.size) > 1024 * 1024) throw new Error('Owner-local receipt asset is missing, unbounded or not uploaded by the owner')
  const bytes = download(`${prefix}/releases/assets/${integer(asset.id)}`)
  if (bytes.length !== asset.size || sha256(bytes) !== marker[1]) throw new Error('Owner-local receipt bytes differ from the owner status')
  const uploaded: unknown = JSON.parse(bytes.toString('utf8'))
  const receipt = rebindReceipt(cwd, uploaded, { repository, repositoryId, candidateSha, producerSha }, channel)
  if (receipt.candidateSha !== candidateSha || object(uploaded).candidateSha !== candidateSha
    || time(status.created_at) + 1000 < time(receipt.completedAt) || time(asset.created_at) + 1000 < time(receipt.completedAt)
    || time(status.created_at) < time(asset.created_at) || time(release.created_at) > time(asset.created_at)
    || release.draft === false && time(release.published_at) + 1000 < time(receipt.completedAt)) throw new Error('Owner-local native evidence chronology differs from execution')
  const configuration = createHash('sha256').update(channel === 'stable' ? 'open-agricola-stable-main-verification-v1\0' : 'open-agricola-prerelease-verification-v1\0').update(receipt.configuration).update('\0').update(receipt.producerConfiguration).digest('hex')
  return { kind: channel === 'stable' ? 'owner-local' : 'owner-local-prerelease', configuration, producerConfiguration: receipt.producerConfiguration, receiptSha256: marker[1], statusId: integer(status.id),
    releaseId: integer(release.id), assetId: integer(asset.id), ownerId: authority.ownerId, url }
}

export function checkOwnerLocalVerification(input: LocalVerificationInput): OwnerLocalProof | null {
  const proof = checkLocalVerification(input, 'stable')
  if (proof && proof.kind !== 'owner-local') throw new Error('Expected stable owner-local authorization')
  return proof
}
export function checkPrereleaseOwnerLocalVerification(input: LocalVerificationInput): PrereleaseOwnerLocalProof | null {
  const proof = checkLocalVerification(input, 'prerelease')
  if (proof && proof.kind !== 'owner-local-prerelease') throw new Error('Expected prerelease owner-local authorization')
  return proof
}
