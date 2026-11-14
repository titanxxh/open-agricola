import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sha = /^[a-f0-9]{40}$/, native = /^sha256:[a-f0-9]{64}$/, day = 86_400_000
const project = 'open-agricola'
type Docker = (args: string[]) => string
type Image = { id: string; tags: string[]; digests: string[]; created: string; size: number; revision: string; channel: string; project: string; service: string; build: string }
type Container = { id: string; image: string; project: string; service: string; build: string; running: boolean }
type FormalImageBinding = { sourceSha: string; configId: string }
type Decision = Image & { action: 'keep' | 'remove'; reasons: string[] }
type Plan = { format: 1; directory: string; createdAt: string; currentBuild: string; currentImage: string; images: Decision[]; containers: Container[]; protectedBuilds: string[]; auditStages: string[] }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid image cleanup inventory')
  return Object.fromEntries(Object.entries(value))
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid image cleanup string')
  return value
}
function strings(value: unknown): string[] {
  if (value === null) return []
  if (!Array.isArray(value)) throw new Error('Invalid image cleanup references')
  return value.map(string)
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid image cleanup size')
  return value
}
function timestamp(value: unknown): number {
  const time = Date.parse(string(value))
  if (!Number.isFinite(time)) throw new Error('Invalid image cleanup timestamp')
  return time
}
function checked(value: unknown, pattern: RegExp): string {
  const text = string(value)
  if (!pattern.test(text)) throw new Error('Invalid immutable image or build identity')
  return text
}
function ownerPath(path: string, directory = false): void {
  const info = lstatSync(path)
  if ((directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) || info.uid !== process.getuid?.()
    || realpathSync(path) !== path) throw new Error('Image cleanup requires owner-owned paths without aliases')
}
function readObject(path: string): Record<string, unknown> {
  ownerPath(path)
  if (lstatSync(path).size > 1024 * 1024) throw new Error('Image cleanup metadata exceeds its limit')
  return object(JSON.parse(readFileSync(path, 'utf8')))
}
function runDocker(directory: string): Docker {
  const run = (args: string[], env: NodeJS.ProcessEnv): string => {
    try { return execFileSync('docker', args, { cwd: directory, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
    catch { throw new Error(`Docker image cleanup command failed: ${args.slice(0, 2).join(' ')}`) }
  }
  const socket = string(JSON.parse(run(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], process.env)))
  if (!/^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(socket) || process.env.DOCKER_HOST && process.env.DOCKER_HOST !== socket) throw new Error('Image cleanup requires the server local Unix Docker daemon')
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('DOCKER_'))), DOCKER_HOST: socket }
  return args => run(args, env)
}
// Project only these fields. Native inspect output must never include Config.Env.
const labels = '{{$l := index .Config "Labels"}}'
const build = '{{$b := ""}}{{range (index .Config "Env")}}{{if eq (index (split . "=") 0) "GAME_BUILD_ID"}}{{$b = .}}{{end}}{{end}}'
const label = (key: string): string => `{{if $l}}{{json (index $l "${key}")}}{{else}}null{{end}}`
const imageFormat = labels + build + '{"id":{{json .Id}},"tags":{{json .RepoTags}},"digests":{{json .RepoDigests}},"created":{{json .Created}},"size":{{json .Size}},"revision":' + label('org.opencontainers.image.revision') + ',"channel":' + label('io.open-agricola.release-channel') + ',"project":' + label('com.docker.compose.project') + ',"service":' + label('com.docker.compose.service') + ',"build":{{json $b}}}'
const containerFormat = labels + build + '{"id":{{json .Id}},"image":{{json .Image}},"project":' + label('com.docker.compose.project') + ',"service":' + label('com.docker.compose.service') + ',"build":{{json $b}},"running":{{json .State.Running}}}'
const optional = (value: unknown): string => value === null ? '' : string(value)
const buildValue = (value: unknown): string => {
  const text = string(value)
  if (!text) return ''
  const valueText = text.replace(/^GAME_BUILD_ID=/, '')
  return sha.test(valueText) ? valueText : 'unknown'
}
function inspectImages(docker: Docker): Image[] {
  const ids = [...new Set(docker(['image', 'ls', '-q', '--no-trunc']).split(/\s+/).filter(Boolean))]
  for (const id of ids) checked(id, native)
  if (!ids.length) return []
  return docker(['image', 'inspect', '--format', imageFormat, ...ids]).split('\n').map(line => {
    const value = object(JSON.parse(line))
    const image = { id: checked(value.id, native), tags: strings(value.tags), digests: strings(value.digests), created: string(value.created), size: number(value.size), revision: optional(value.revision), channel: optional(value.channel), project: optional(value.project), service: optional(value.service), build: buildValue(value.build) }
    timestamp(image.created)
    return image
  })
}
function inspectContainers(docker: Docker): Container[] {
  const ids = docker(['ps', '-a', '-q', '--no-trunc']).split(/\s+/).filter(Boolean)
  if (!ids.length) return []
  for (const id of ids) checked(id, /^[a-f0-9]{64}$/)
  return docker(['container', 'inspect', '--format', containerFormat, ...ids]).split('\n').map(line => {
    const value = object(JSON.parse(line))
    if (typeof value.running !== 'boolean') throw new Error('Invalid native container state')
    return { id: checked(value.id, /^[a-f0-9]{64}$/), image: checked(value.image, native), project: optional(value.project), service: optional(value.service), build: buildValue(value.build), running: value.running }
  })
}
const ownTag = (tag: string): boolean => /^open-agricola:(?:backend|pre-v[0-9]+\.[0-9]+\.[0-9]+)$/.test(tag) || tag === 'open-agricola-app:latest'
const ownDigest = (digest: string): boolean => /^(?:open-agricola|open-agricola-app)@sha256:[a-f0-9]{64}$/.test(digest)
const repository = (reference: string): string => reference.split(/[:@]/)[0] ?? ''
const knownReferences = (image: Image): boolean => image.tags.every(ownTag) && image.digests.every(ownDigest)
  && new Set(image.digests.map(repository)).size === image.digests.length
function owned(image: Image, formalImages: ReadonlyMap<string, FormalImageBinding>): boolean {
  return image.channel === 'stable' && formalImages.get(image.id)?.sourceSha === image.revision && sha.test(image.revision)
    || image.project === project && image.service === 'app' && image.channel !== 'prerelease'
}
function sameIdentity(a: Image, b: Image): boolean {
  return a.id === b.id && a.revision === b.revision && a.build === b.build && a.channel === b.channel && a.project === b.project && a.service === b.service
}

export function planBackendImageCleanup({ directory, docker = runDocker(directory), now = Date.now(), expectedBuild, execute = false }: { directory: string; docker?: Docker; now?: number; expectedBuild?: string; execute?: boolean }): Plan {
  ownerPath(directory, true); ownerPath(join(directory, 'data'), true); ownerPath(join(directory, 'backups'), true)
  const images = inspectImages(docker), containers = inspectContainers(docker)
  const current = containers.filter(value => value.project === project && value.service === 'app')
  if (current.length !== 1 || !current[0]?.running) throw new Error('Exactly one running formal application is required')
  const app = current[0], currentBuild = checked(readFileSync(join(directory, 'data/deployed-build-id'), 'utf8').trim(), sha)
  if (app.build !== currentBuild || expectedBuild && expectedBuild !== currentBuild) throw new Error('Current formal application differs from the expected accepted build')
  const reasons = new Map<string, Set<string>>()
  const protect = (id: string, reason: string): void => { checked(id, native); const values = reasons.get(id) ?? new Set<string>(); values.add(reason); reasons.set(id, values) }
  for (const container of containers) protect(container.image, `container:${container.id}`)
  protect(app.image, 'current-application')
  const environmentPath = join(directory, '.env'); ownerPath(environmentPath)
  const selectors = readFileSync(environmentPath, 'utf8').split('\n').filter(line => /^\s*(?:export\s+)?BACKEND_IMAGE(?:\s|=|$)/.test(line))
  if (selectors.length > 1 || selectors.some(line => !/^BACKEND_IMAGE=sha256:[a-f0-9]{64}\r?$/.test(line))) throw new Error('Invalid immutable installed backend selector')
  const selector = selectors[0]?.trim().slice('BACKEND_IMAGE='.length)
  if (selector && selector !== app.image || execute && !selector) throw new Error('Installed backend selector differs or is missing')
  if (selector) protect(selector, 'installed-selector')
  const deployed = join(directory, 'data/deployed-image.json')
  if (existsSync(deployed)) {
    const receipt = readObject(deployed)
    if (receipt.sourceSha !== currentBuild || receipt.nativeImageId !== app.image) throw new Error('Deployed image receipt differs from the running application')
    protect(checked(receipt.nativeImageId, native), 'deployed-image')
  } else if (execute) throw new Error('Accepted fixed-image deployment receipt is required before cleanup')
  const builds = new Set<string>([currentBuild]), backupRoot = join(directory, 'backups')
  for (const name of readdirSync(backupRoot)) {
    if (!/^(?:daily|pre|manual)-[A-Za-z0-9._-]+\.manifest\.json$/.test(name)) continue
    const stem = name.slice(0, -'.manifest.json'.length)
    // An ordinary retained set pins both tool builds until its archive is removed.
    if (!existsSync(join(backupRoot, `${stem}.tgz`))) continue
    ownerPath(join(backupRoot, `${stem}.tgz`)); ownerPath(join(backupRoot, `env-${stem}`))
    const report = readObject(join(backupRoot, name))
    if (report.formatVersion !== 2 || report.backupStem !== stem || report.environment !== undefined && report.environment !== 'stable') throw new Error('Retained backup does not identify a formal validated set')
    timestamp(report.validatedAt)
    builds.add(checked(report.sourceBuildId, sha)); builds.add(checked(report.targetBuildId, sha))
  }
  const formalImages = new Map<string, FormalImageBinding>()
  const inventoryStages = readdirSync(backupRoot).filter(name => /^\.backend-image-[a-f0-9-]{36}$/.test(name)).flatMap(name => {
    const path = join(backupRoot, name); ownerPath(path, true)
    const receiptPath = join(path, 'image.json')
    if (!existsSync(receiptPath)) return []
    ownerPath(receiptPath)
    const report = readObject(receiptPath), request = readObject(join(path, 'request.json')), receipt = object(object(request.transfer).receipt)
    const sourceSha = checked(request.sourceSha, sha), producerSha = checked(request.producerSha, sha), configId = checked(receipt.imageId, native)
    const nativeImageId = checked(report.nativeImageId, native)
    for (const value of [report.sourceSha, receipt.sourceSha]) checked(value, sha)
    for (const value of [report.producerSha, receipt.producerSha]) checked(value, sha)
    checked(report.imageId, native); checked(report.bindingSha256, /^[a-f0-9]{64}$/)
    const operationId = checked(request.operationId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
    // Owner delivery serializes the receiver's canonical request. Its renewal
    // changes only expiresAt, which the receiver excludes from this seal.
    const boundRequest = Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'expiresAt'))
    const binding = createHash('sha256').update(JSON.stringify(boundRequest)).digest('hex')
    if (request.format !== 1 || request.directory !== directory || request.stage !== path
      || path !== join(backupRoot, `.backend-image-${operationId}`) || report.bindingSha256 !== binding
      || receipt.purpose !== 'formal-candidate' || receipt.channel !== 'stable' || receipt.repository !== 'titanxxh/open-agricola'
      || receipt.sourceSha !== sourceSha || receipt.producerSha !== producerSha
      || report.format !== 1 || report.sourceSha !== sourceSha || report.producerSha !== producerSha || report.imageId !== configId) throw new Error('Formal image audit does not prove application ownership')
    const previous = formalImages.get(nativeImageId)
    if (previous && (previous.sourceSha !== sourceSha || previous.configId !== configId)) throw new Error('Conflicting formal image source or config bindings')
    formalImages.set(nativeImageId, { sourceSha, configId })
    let active = false
    for (const file of ['request.json', 'maintenance-admission.json']) {
      if (!existsSync(join(path, file))) continue
      const record = readObject(join(path, file))
      const limit = file === 'request.json' ? record.expiresAt : record.phase === 'queued' ? record.queueUntil : record.workDeadline
      if (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > now && limit <= now + 100 * 60_000) active = true
    }
    return [{ name, path, modified: lstatSync(receiptPath).mtimeMs, active }]
  })
  const historicalStages = inventoryStages.filter(stage => now - stage.modified <= 30 * day).sort((a, b) => b.modified - a.modified).slice(0, 5)
  const stages = inventoryStages.filter(stage => stage.active || historicalStages.includes(stage))
  for (const stage of stages) {
    const receipt = readObject(join(stage.path, 'image.json'))
    builds.add(checked(receipt.sourceSha, sha)); protect(checked(receipt.nativeImageId, native), `recent-import:${stage.name}`)
    const sourcePath = join(stage.path, 'source.json')
    if (existsSync(sourcePath)) {
      const source = readObject(sourcePath)
      builds.add(checked(source.build, sha)); protect(checked(source.image, native), `recent-source:${stage.name}`)
    }
  }
  const recoveryPath = join(directory, 'data/backend-image-recovery.json')
  if (existsSync(recoveryPath)) {
    const recovery = readObject(recoveryPath), created = timestamp(recovery.createdAt), expires = timestamp(recovery.expiresAt)
    if (recovery.format !== 1 || created > now || expires <= created || expires - created > 30 * day) throw new Error('Invalid bounded image recovery binding')
    if (expires > now) {
      for (const id of strings(recovery.images)) protect(checked(id, native), 'owner-recovery')
      for (const build of strings(recovery.builds)) builds.add(checked(build, sha))
    }
  }
  const recentBuilds = [...new Set(images.filter(image => owned(image, formalImages) && now - timestamp(image.created) <= 30 * day)
    .sort((a, b) => timestamp(b.created) - timestamp(a.created)).map(image => image.build || image.revision).filter(value => sha.test(value) && value !== currentBuild))].slice(0, 5)
  for (const image of images) {
    if (builds.has(image.build) || builds.has(image.revision)) protect(image.id, 'retained-build')
    if (recentBuilds.includes(image.build || image.revision)) protect(image.id, 'recent-version')
    if (!owned(image, formalImages)) protect(image.id, 'unknown-or-other-project')
    if (image.build && !sha.test(image.build) || image.revision && !sha.test(image.revision)) protect(image.id, 'unknown-build')
    if (image.build && image.revision && image.build !== image.revision) protect(image.id, 'conflicting-build')
    if (!knownReferences(image)) protect(image.id, 'unknown-reference')
    if (timestamp(image.created) > now) protect(image.id, 'future-created')
    if (!image.build && !sha.test(image.revision) && now - timestamp(image.created) <= 30 * day) protect(image.id, 'recent-unversioned')
  }
  return { format: 1, directory, createdAt: new Date(now).toISOString(), currentBuild, currentImage: app.image,
    images: images.map(image => ({ ...image, action: reasons.has(image.id) ? 'keep' : 'remove', reasons: [...(reasons.get(image.id) ?? [])].sort() })),
    containers, protectedBuilds: [...builds].sort(), auditStages: stages.map(stage => stage.name) }
}

export function executeBackendImageCleanup({ directory, expectedBuild, docker = runDocker(directory), now = Date.now() }: { directory: string; expectedBuild: string; docker?: Docker; now?: number }) {
  checked(expectedBuild, sha)
  // Called after flock, never consume a previously saved plan as deletion authority.
  const plan = planBackendImageCleanup({ directory, expectedBuild, docker, now, execute: true })
  const logDirectory = join(directory, 'backups', `.image-cleanup-${randomUUID()}`)
  mkdirSync(logDirectory, { mode: 0o700 })
  const results: { image: string; status: 'removed' | 'skipped' | 'failed'; reason?: string }[] = []
  const save = (): void => writeFileSync(join(logDirectory, 'result.json'), JSON.stringify({ plan, results }, null, 2) + '\n', { mode: 0o600, flush: true })
  save()
  for (const candidate of plan.images.filter(image => image.action === 'remove')) {
    try {
      const fresh = planBackendImageCleanup({ directory, expectedBuild, docker, now: Date.now(), execute: true }).images.find(image => image.id === candidate.id)
      if (!fresh || fresh.action !== 'remove' || JSON.stringify([fresh.tags, fresh.digests]) !== JSON.stringify([candidate.tags, candidate.digests])) {
        results.push({ image: candidate.id, status: 'skipped', reason: 'Inventory or protection changed' }); save(); continue
      }
      // RepoDigests can be synthesized from tags. Removing a digest may remove
      // every tag in that repository, so retain one repository until native rmi.
      const keeper = fresh.tags.at(-1) ?? fresh.digests.at(-1)
      const keeperRepository = keeper ? repository(keeper) : ''
      const references = [...fresh.tags.slice(0, -1), ...fresh.digests.filter(digest => repository(digest) !== keeperRepository)]
      for (const reference of references) {
        if (inspectContainers(docker).some(container => container.image === candidate.id)) throw new Error('New container now references the image')
        const images = inspectImages(docker), current = images.find(image => image.id === candidate.id)
        if (!current || !sameIdentity(current, fresh) || !knownReferences(current)
          || images.some(image => image.id !== candidate.id && [...image.tags, ...image.digests].includes(reference))) throw new Error('Image reference changed before untagging')
        // Docker can remove an associated digest together with its tag.
        if ([...current.tags, ...current.digests].includes(reference)) docker(['image', 'rm', '--no-prune', reference])
      }
      const remaining = inspectImages(docker).find(image => image.id === candidate.id)
      if (!remaining || !sameIdentity(remaining, fresh) || !knownReferences(remaining)
        || inspectContainers(docker).some(container => container.image === candidate.id)) throw new Error('Image references changed before native deletion')
      docker(['image', 'rm', '--no-prune', candidate.id])
      if (inspectImages(docker).some(image => image.id === candidate.id)) throw new Error('Native image remains after Docker removal')
      results.push({ image: candidate.id, status: 'removed' })
    } catch (error) { results.push({ image: candidate.id, status: 'failed', reason: error instanceof Error ? error.message : 'Image deletion refused' }) }
    save()
  }
  return { logDirectory, results, failed: results.some(result => result.status === 'failed') }
}

export function backendImageCleanupCli(args: string[]): void {
  const [directory, ...flags] = args
  if (!directory || resolve(directory) !== directory || directory === '/' || process.env.BACKEND_IMAGE_GC_LOCKED !== '1' || process.env.CI) throw new Error('Use the owner cleanup-backend-images.sh entry and its maintenance lock')
  let execute = false, expectedBuild: string | undefined
  for (let index = 0; index < flags.length; index++) {
    if (flags[index] === '--execute' && !execute) execute = true
    else if (flags[index] === '--expected-build' && !expectedBuild) expectedBuild = checked(flags[++index], sha)
    else throw new Error('Usage: cleanup-backend-images.sh [host] [directory] [--execute --expected-build SHA]')
  }
  if (execute && !expectedBuild) throw new Error('Execution requires the accepted --expected-build SHA')
  if (execute && expectedBuild) {
    const result = executeBackendImageCleanup({ directory, expectedBuild })
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (result.failed) process.exitCode = 1
  } else process.stdout.write(JSON.stringify(planBackendImageCleanup({ directory, expectedBuild }), null, 2) + '\n')
}
if (process.argv[1] === '-' || process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { backendImageCleanupCli(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Backend image cleanup failed'); process.exitCode = 1 }
}
