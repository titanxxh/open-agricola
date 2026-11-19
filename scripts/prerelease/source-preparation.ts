import { checkPreparationSwap, type SourceBudget } from './source-budget.ts'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { assertOwnerPath, assertScopedPaths, targetFingerprint, type PrereleaseTarget } from './config.ts'
import { assertCapacity, command } from './docker.ts'
import { approvedRuntimePin, installedRuntime } from './source-runtime.ts'
import { readRuntime } from './runtime.ts'
import { sourceReleaseDirectory } from './source-release-path.ts'

export { sourceReleaseDirectory }
export type PreparedPrereleaseSource = { buildId: string; image: string; runtimeDigest: string }
const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)

function ownedJson(path: string): unknown {
  assertOwnerPath(path)
  const info = lstatSync(path)
  if (!info.isFile() || info.size > 32768 || info.uid !== process.getuid?.() || info.mode & 0o022) throw new Error('Invalid prepared source metadata')
  return JSON.parse(readFileSync(path, 'utf8'))
}

function verifyFrontend(app: string, buildId: string) {
  const meta = ownedJson(join(app, 'frontend-dist/frontend-build.json'))
  if (!meta || typeof meta !== 'object' || !('format' in meta) || meta.format !== 1 || !('basePath' in meta) || meta.basePath !== '/open-agricola/' || !('gameBuildId' in meta) || meta.gameBuildId !== buildId ||
    !('releaseChannel' in meta) || meta.releaseChannel !== 'prerelease' || !('deploymentTarget' in meta) ||
    meta.deploymentTarget !== 'prerelease-hosted') throw new Error('Prepared frontend does not match the prerelease source')
}

export function readPreparedPrereleaseSource(target: PrereleaseTarget, buildId: string): PreparedPrereleaseSource {
  const app = sourceReleaseDirectory(target, buildId)
  const raw = ownedJson(join(dirname(app), 'receipt.json'))
  if (!raw || typeof raw !== 'object' || !('format' in raw) || raw.format !== 1 || !('buildId' in raw) || raw.buildId !== buildId
    || !('targetFingerprint' in raw) || raw.targetFingerprint !== targetFingerprint(target) || !('image' in raw) || !digest(raw.image)
    || !('runtimeDigest' in raw) || !digest(raw.runtimeDigest)) throw new Error('Prepared source belongs to a different installation')
  verifyFrontend(app, buildId)
  return { buildId, image: raw.image, runtimeDigest: raw.runtimeDigest }
}

// The operation lock serializes writers. A killed preparation can leave a staging directory,
// but only the rename publishes an input or app for use by a later run.
function publishDirectory(destination: string, populate: (stage: string) => void) {
  assertOwnerPath(destination)
  if (existsSync(destination)) return
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  const stage = mkdtempSync(join(dirname(destination), '.prepare-'))
  try {
    populate(stage)
    renameSync(stage, destination)
  } finally { rmSync(stage, { recursive: true, force: true }) }
}

// This lock-scoped cleanup keeps the live and rollback revisions even if newer preparations failed.
function pruneDirectories(root: string, pattern: RegExp, protectedKeys: Set<string>) {
  assertOwnerPath(root)
  if (!existsSync(root)) return
  const children = readdirSync(root, { withFileTypes: true })
  const completed = children.filter(entry => entry.isDirectory() && pattern.test(entry.name))
    .map(entry => ({name: entry.name, time: lstatSync(join(root, entry.name)).mtimeMs}))
    .sort((left, right) => right.time - left.time)
  for (const row of completed.slice(2)) {
    if (!protectedKeys.has(row.name)) rmSync(join(root, row.name), { recursive: true })
  }
  for (const row of children) {
    if (row.isDirectory() && /^\.prepare-[A-Za-z0-9]{6}$/.test(row.name)) rmSync(join(root, row.name), { recursive: true })
  }
}

function fixedRepository(cache: string, repository: 'open-agricola-assets' | 'open-agricola-i18n', revision: string): string {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Build input needs a pinned git revision')
  const destination = join(cache, repository, revision)
  publishDirectory(destination, stage => {
    const git = (args: string[]) => command('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: stage, timeout: 180000 })
    git(['init', '--quiet'])
    git(['fetch', '--quiet', '--depth=1', '--no-tags', 'https://github.com/titanxxh/' + repository + '.git', revision])
    git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'])
    if (git(['rev-parse', 'HEAD']) !== revision) throw new Error('Fetched repository differs from its pin')
  })
  return destination
}

export function preparePrereleaseSource(target: PrereleaseTarget, buildId: string, budget?: SourceBudget): PreparedPrereleaseSource {
  const app = sourceReleaseDirectory(target, buildId)
  const pin = approvedRuntimePin(target.policyDirectory, buildId)
  const runtime = installedRuntime(pin, args => command('docker', args))
  if (!runtime.available) throw new Error('Pinned runtime missing: complete the owner runtime transfer before preparing source')
  assertScopedPaths(target)
  if (existsSync(dirname(app))) {
    const previous = readPreparedPrereleaseSource(target, buildId)
    if (previous.image !== runtime.image || previous.runtimeDigest !== pin.manifestDigest) throw new Error('Installed source differs from its approved runtime')
    return previous
  }
  const previous = readRuntime(target)
  const retained = new Set([buildId, previous.installed?.buildId, previous.operation?.buildId, previous.operation?.sourceBuildId].filter((id): id is string => Boolean(id)))
  const label = 'io.open-agricola.prerelease-preparation=' + targetFingerprint(target)
  const stale = command('docker', ['ps', '--all', '--quiet', '--no-trunc', '--filter', 'label=' + label]).split(/\s+/).filter(Boolean)
  if (stale.length) command('docker', ['rm', '-fv', ...stale])
  pruneDirectories(join(target.directory, 'source-releases'), /^[a-f0-9]{40}$/, retained)
  const limits = budget ?? { ...target.budgets.tools, swapMiB: 0 }
  assertCapacity(target, 'tool', limits.memoryMiB)
  const cache = join(target.directory, 'source-inputs')
  for (const name of ['open-agricola-assets', 'open-agricola-i18n', 'installed', 'registry']) {
    pruneDirectories(join(cache, name), /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, new Set())
  }
  const blob = (name: string): Buffer => execFileSync('git', ['--no-replace-objects', 'show', buildId + ':' + name], {
    cwd: target.policyDirectory, maxBuffer: 16 * 1024 * 1024,
  })
  const lang: unknown = JSON.parse(blob('i18n.ref').toString())
  if (!lang || typeof lang !== 'object' || !('repository' in lang) || lang.repository !== 'titanxxh/open-agricola-i18n'
    || !('revision' in lang) || typeof lang.revision !== 'string') throw new Error('Unexpected prerelease language repository')
  const assets = fixedRepository(cache, 'open-agricola-assets', blob('public-assets.ref').toString().trim())
  const i18n = fixedRepository(cache, 'open-agricola-i18n', lang.revision)
  function run(stage: string, mounts: string[], online = false) {
    assertCapacity(target, 'tool', limits.memoryMiB)
    checkPreparationSwap(limits)
    const name = 'oa-source-' + randomUUID()
    try {
      command('bash', [join(target.policyDirectory, 'scripts/prerelease/run-source-stage.sh'), name, target.directory,
        String(target.budgets.diskMiB * 1048576), String(target.budgets.import.maxArchiveMiB * 2 * 1048576),
        '--label', label, '--network', online ? 'bridge' : 'none',
        '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user', process.getuid?.() + ':' + process.getgid?.(),
        '--memory', limits.memoryMiB + 'm', '--memory-swap', (limits.memoryMiB + limits.swapMiB) + 'm', '--cpus', String(limits.cpus),
        '--pids-limit', String(limits.pids), '--ulimit', 'fsize=' + target.budgets.import.maxArchiveMiB * 1048576, '--tmpfs', '/tmp:size=' + limits.memoryMiB + 'm,mode=1777', '--tmpfs', '/var/lib/postgresql',
        '--env', 'RELEASE_CHANNEL=prerelease', '--env', 'GAME_BUILD_ID=' + buildId,
        ...(stage === 'trial' ? ['--tmpfs', '/app/output:size=64m,mode=1777'] : []),
        ...mounts.flatMap(mount => ['--volume', mount]), '--entrypoint', '/bin/bash', runtime.image, '/usr/local/lib/oa/prepare.sh', stage],
        {timeout: 30 * 60_000})
    } finally {
      if (command('docker', ['ps', '-aq', '--filter', 'name=^/' + name + '$'])) command('docker', ['rm', '-fv', name])
    }
  }
  const inputs = ['package.json', 'pnpm-lock.yaml', '.npmrc'].map(name => ({name, contents: blob(name)}))
  const key = createHash('sha256').update(pin.manifestDigest)
  for (const {name, contents} of inputs) key.update(name).update(createHash('sha256').update(contents).digest())
  const depDir = join(cache, 'installed', key.digest('hex'))
  publishDirectory(depDir, stage => {
    const inputDir = join(stage, 'inputs')
    mkdirSync(inputDir)
    for (const {name, contents} of inputs) writeFileSync(join(inputDir, name), contents, { mode: 0o600 })
    const storeDir = join(cache, 'registry', createHash('sha256').update(pin.manifestDigest).update(blob('pnpm-lock.yaml')).digest('hex'))
    publishDirectory(storeDir, store => run('fetch', [join(inputDir, 'pnpm-lock.yaml') + ':/inputs/pnpm-lock.yaml:ro', store + ':/cache'], true))
    mkdirSync(join(stage, 'app'))
    run('install', [inputDir + ':/inputs:ro', storeDir + ':/packages:ro', join(stage, 'app') + ':/app'])
    rmSync(inputDir, { recursive: true })
  })
  publishDirectory(dirname(app), stage => {
    const payload = join(stage, 'app')
    const archive = join(stage, 'source.tar')
    command('prlimit', ['--fsize=' + target.budgets.import.maxArchiveMiB * 1048576, '--', 'git', '--no-replace-objects',
      'archive', '--format=tar', '--output=' + archive, buildId], {cwd: target.policyDirectory})
    mkdirSync(payload)
    run('build', [payload + ':/app', archive + ':/inputs/source.tar:ro', join(depDir, 'app') + ':/dependencies:ro',
      assets + ':/public-assets:ro', i18n + ':/i18n:ro'])
    verifyFrontend(payload, buildId)
    // Compose adds a separate writable mount at /app/output and the candidate may supply arbitrary files.
    assertOwnerPath(join(payload, 'output'))
    mkdirSync(join(payload, 'output'), {recursive: true})
    run('trial', [payload + ':/app:ro'])
    rmSync(archive)
    writeFileSync(join(stage, 'receipt.json'), JSON.stringify({format: 1, targetFingerprint: targetFingerprint(target), buildId,
      image: runtime.image, runtimeDigest: pin.manifestDigest}) + '\n', {flag: 'wx', mode: 0o600})
  })
  return readPreparedPrereleaseSource(target, buildId)
}
