import { execFileSync, spawnSync } from 'node:child_process'
import { accessSync, chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fullSha } from '../ci/verification-tasks.ts'
import { BACKEND_IMAGE_CLEANUP_MS, BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS, BACKEND_IMAGE_MAINTENANCE_WORK_MS, BACKEND_IMAGE_QUEUE_WAIT_MS, admitBackendImageOperation, backendImageRequestBinding, inspectReceivedBackendImage, pinBackendDocker, readBackendImageEvidence, readBackendImageOperation, startBackendImageOperation, verifyReceivedBackendImage, type BackendImageRequest } from './backend-image-receiver.ts'
import { BACKEND_RESUME_WORK_MS, backendEvidenceHash, privateBackendEvidence, readBackendProgress, validateBackendResumeAuthorization, writeBackendProgress, type BackendProgress } from './backend-image-progress.ts'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native backend inventory')
  return Object.fromEntries(Object.entries(value))
}
function environment(value: unknown): Record<string, string> {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !/^[^=\0]+=/.test(item))) throw new Error('Invalid source application environment')
  return Object.fromEntries(value.map(item => { const text = String(item), index = text.indexOf('='); return [text.slice(0, index), text.slice(index + 1)] }))
}
function execute(command: string, args: string[], cwd: string, env = process.env, timeout = 30_000): string {
  try { return execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  catch { throw new Error(`Backend maintenance command failed: ${command} ${args.slice(0, 2).join(' ')}`) }
}
function caddyDigest(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(?:caddy|docker\.io\/library\/caddy)@(sha256:[a-f0-9]{64})$/.exec(value)
  return match?.[1] ?? null
}
function prepareCommunityStorage(root: string): void {
  const data = join(root, 'data'), path = join(data, 'community')
  if (!lstatSync(data).isDirectory()) throw new Error('Community storage requires a real data directory')
  let created = false
  try { mkdirSync(path, { mode: 0o755 }); created = true }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
  const info = lstatSync(path)
  if (!info.isDirectory() || info.uid !== process.getuid?.()) throw new Error('Community storage must be an owner-owned real directory')
  if (created) chmodSync(path, 0o755)
  else if ((info.mode & 0o700) !== 0o700) throw new Error('Community storage must be writable and traversable by its owner')
  accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK)
}
// .env is Compose's durable image selector. The JSON receipt is audit evidence only.
// Keep a blank selector after live migration starts until the exact target is accepted.
function installedImageBinding(root: string) {
  const path = join(root, '.env')
  const read = (): string => {
    const info = lstatSync(path)
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.size > 256 * 1024) throw new Error('Backend .env must be an owner-owned regular file')
    return readFileSync(path, 'utf8')
  }
  let current = read()
  const parse = (name: string) => {
    const assignments = current.split('\n').filter(line => new RegExp(`^\\s*(?:export\\s+)?${name}(?:\\s|=|$)`).test(line))
    if (assignments.length > 1 || assignments.some(line => !new RegExp(`^${name}=(?:sha256:[a-f0-9]{64})?\\r?$`).test(line))) throw new Error(`Backend .env requires one unquoted immutable ${name} assignment or none before the first delivery`)
    return { name, image: assignments[0]?.trim().slice(name.length + 1) || null, present: assignments.length === 1 }
  }
  const backend = parse('BACKEND_IMAGE'), caddy = parse('CADDY_IMAGE')
  return { image: backend.image, caddyImage: caddy.image, write(value: string, caddyImage?: string) {
    const updates = [{ binding: backend, value }, ...(caddyImage === undefined ? [] : [{ binding: caddy, value: caddyImage }])]
    if (updates.some(update => update.value !== '' && !/^sha256:[a-f0-9]{64}$/.test(update.value))) throw new Error('Installed backend and Caddy images must be immutable')
    if (read() !== current) throw new Error('Backend .env changed during maintenance')
    let next = current
    for (const { binding, value: selected } of updates) next = binding.present
      ? next.replace(new RegExp(`^${binding.name}=[^\\r\\n]*`, 'm'), `${binding.name}=${selected}`)
      : next + (next.endsWith('\n') ? '' : '\n') + `${binding.name}=${selected}\n`
    const temporary = join(root, `.env.backend-image-${randomUUID()}`)
    try {
      writeFileSync(temporary, next, { flag: 'wx', mode: 0o600, flush: true })
      renameSync(temporary, path)
      const directory = openSync(root, 'r')
      try { fsyncSync(directory) } finally { closeSync(directory) }
      current = next
      for (const { binding } of updates) binding.present = true
    } finally { if (existsSync(temporary)) unlinkSync(temporary) }
  } }
}
type Target = Pick<BackendImageRequest, 'directory' | 'sourceSha' | 'producerSha'>
function validateTarget(request: BackendImageRequest, expected: Target): BackendImageRequest {
  if (request.directory !== expected.directory || request.sourceSha !== fullSha(expected.sourceSha)
    || request.producerSha !== fullSha(expected.producerSha)) throw new Error('Formal image request differs from the owner maintenance target')
  return request
}

export function maintainBackendImage(path: string, expected: Target): void {
  const operation = readBackendImageOperation(path, 'maintenance'), request = validateTarget(operation.request, expected), root = request.directory, policy = resolve(import.meta.dirname, '../..')
  if (policy !== join(request.stage, 'policy')) throw new Error('Maintenance controller must come from the staged trusted producer')
  let deadline = performance.now() + Math.min(BACKEND_IMAGE_MAINTENANCE_WORK_MS, operation.workDeadline - Date.now())
  const run = (command: string, args: string[], cwd: string, env = process.env, timeout = 30_000): string => {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining <= 0) throw new Error('Formal backend maintenance deadline expired')
    return execute(command, args, cwd, env, Math.min(timeout, remaining))
  }
  const docker = (args: string[], timeout?: number): string => run('docker', args, root, process.env, timeout)
  const unpin = pinBackendDocker(request.stage, docker)
  let restartOld = false
  let drainTarget: (() => void) | undefined
  let source: { id: string; image: string; build: string; running: boolean } | undefined
  const inspect = (id: string): Record<string, unknown> => {
    const values: unknown = JSON.parse(docker(['inspect', id]))
    if (!Array.isArray(values) || values.length !== 1) throw new Error('Expected exactly one native application container')
    return object(values[0])
  }
  try {
    const image = verifyReceivedBackendImage(path, expected, 'maintenance', docker), installed = installedImageBinding(root)
    const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', APP_UID: String(process.getuid?.()), APP_GID: String(process.getgid?.()), BACKEND_IMAGE: image, GAME_BUILD_ID: request.sourceSha, RELEASE_CHANNEL: 'stable', CADDY_IMAGE: installed.caddyImage ?? 'caddy:alpine' }
    const git = (args: string[]): string => run('git', args, root, env)
    const config = (): Record<string, unknown> => object(JSON.parse(run('docker', ['compose', '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'], root, env)))
    if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Tracked local edits must be resolved before deployment')
    if (!existsSync(join(root, 'data/postgres-cutover.validated'))) throw new Error('Validate the PostgreSQL cutover before deployment')
    prepareCommunityStorage(root)
    const previousRef = fullSha(git(['rev-parse', 'HEAD'])), sourceConfig = config(), sourceServices = object(sourceConfig.services)
    if (typeof sourceConfig.name !== 'string' || !sourceConfig.name) throw new Error('Source Compose project identity is missing')
    const oldId = run('docker', ['compose', '-f', 'docker-compose.prod.yml', 'ps', '-a', '-q', 'app'], root, env)
    let oldEnv: Record<string, unknown>, oldExitCode: unknown
    const bootstrap = request.installation.kind === 'bootstrap'
    if (bootstrap) {
      if (docker(['volume', 'ls', '--filter', `label=com.docker.compose.project=${sourceConfig.name}`, '--format', '{{.Name}}'])) throw new Error('Bootstrap cannot reuse retained project volumes')
      if (oldId || installed.image || installed.caddyImage || existsSync(join(root, 'data/deployed-build-id')) || existsSync(join(root, 'data/deployed-image.json'))
        || existsSync(join(root, 'legacy-data'))
        || ['', 'data/'].some(directory => ['open-agricola.db', 'open-agricola.db-wal', 'open-agricola.db-shm', 'replay-removals.jsonl', 'card-art', 'replay-assets', 'replay-viewers'].some(name => existsSync(join(root, directory, name)))) || readdirSync(join(root, 'backups')).some(name => !/^\.backend-image-[a-f0-9-]+$/.test(name) && name !== '.maintenance.lock')) throw new Error('Bootstrap requires no retained deployment, backup, ledger or legacy source; use the existing-data recovery path')
      oldEnv = object(object(sourceServices.app).environment)
    } else {
      if (!/^[a-f0-9]{12,64}$/.test(oldId)) throw new Error('Exactly one retained source application container is required; use explicit empty-installation bootstrap only for new storage')
      const old = inspect(oldId), oldState = object(old.State), oldConfig = object(old.Config), labels = object(oldConfig.Labels)
      oldEnv = environment(oldConfig.Env); oldExitCode = oldState.ExitCode
      if (old.Id !== oldId || typeof old.Image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(old.Image)
        || labels['com.docker.compose.project'] !== sourceConfig.name || labels['com.docker.compose.service'] !== 'app'
        || typeof oldState.Running !== 'boolean' || oldState.OOMKilled !== false) throw new Error('Source application inventory or OOM boundary differs')
      source = { id: oldId, image: old.Image, build: fullSha(String(oldEnv.GAME_BUILD_ID ?? '')), running: oldState.Running }
      if (installed.image && installed.image !== source.image) throw new Error('Installed Compose image differs from the retained source application')
    }
    git(['fetch', 'origin', request.sourceSha])
    if (git(['rev-parse', 'FETCH_HEAD^{commit}']) !== request.sourceSha) throw new Error('Fetched backend candidate mismatch')
    git(['checkout', '--detach', request.sourceSha])
    if (git(['rev-parse', 'HEAD']) !== request.sourceSha) throw new Error('Checked-out backend candidate mismatch')
    const targetConfig = config(), services = object(targetConfig.services), app = object(services.app)
    if (targetConfig.name !== sourceConfig.name || Object.keys(services).sort().join(',') !== 'app,caddy') throw new Error('Target Compose deployment inventory differs')
    const targetEnv = object(app.environment)
    for (const key of ['DATABASE_URL', 'DATABASE_SCHEMA', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_PREFIX', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      if ((targetEnv[key] ?? '') !== (oldEnv[key] ?? '')) throw new Error('Target data configuration differs from the retained source application')
    }
    if (!oldEnv.DATABASE_URL || !oldEnv.S3_ENDPOINT || !oldEnv.S3_BUCKET) throw new Error('Source application data target is incomplete')
    const caddyId = run('docker', ['compose', '-f', 'docker-compose.prod.yml', 'ps', '-a', '-q', 'caddy'], root, env)
    let caddyImage: unknown
    if (request.installation.kind === 'bootstrap') {
      if (caddyId) throw new Error('Bootstrap requires no retained Caddy container')
      const values: unknown = JSON.parse(docker(['image', 'inspect', request.installation.caddyImage]))
      if (!Array.isArray(values) || values.length !== 1) throw new Error('Expected one preloaded immutable Caddy image')
      const caddy = object(values[0])
      if (caddy.Os !== 'linux' || caddy.Architecture !== 'amd64' || !Array.isArray(caddy.RepoDigests)
        || !caddy.RepoDigests.some(value => caddyDigest(value) === caddyDigest(request.installation.kind === 'bootstrap' ? request.installation.caddyImage : null))) throw new Error('Preloaded Caddy digest or platform differs from the explicit bootstrap input')
      caddyImage = caddy.Id
    } else {
      if (!/^[a-f0-9]{12,64}$/.test(caddyId)) throw new Error('Retained Caddy inventory is required')
      caddyImage = inspect(caddyId).Image
    }
    if (typeof caddyImage !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(caddyImage)) throw new Error('Invalid immutable Caddy image')
    if (installed.caddyImage && installed.caddyImage !== caddyImage) throw new Error('Installed Compose image differs from the retained or selected Caddy')
    for (const [name, value] of Object.entries(services)) {
      const service = object(value)
      delete service.build
      service.pull_policy = 'never'
      if (name === 'app') {
        service.image = image
        service.labels = { ...object(service.labels ?? {}), 'org.open-agricola.backend-operation': request.operationId }
        service.environment = { ...targetEnv, GAME_BUILD_ID: request.sourceSha, RELEASE_CHANNEL: 'stable', NODE_ENV: 'production' }
      } else service.image = caddyImage
      services[name] = service
    }
    if (source) {
      const capture = object(sourceServices.app)
      delete capture.build; delete capture.depends_on; delete capture.ports; delete capture.container_name
      services.capture = { ...capture, image: source.image, environment: oldEnv, pull_policy: 'never', profiles: ['maintenance'], restart: 'no' }
    }
    targetConfig.services = services
    const composePath = join(request.stage, 'maintenance.compose.json')
    writeFileSync(composePath, JSON.stringify(targetConfig) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    const compose = (args: string[], timeout?: number): string => run('docker', ['compose', '-f', composePath, ...args], root, env, timeout)
    if (source) {
      writeFileSync(join(request.stage, 'source.json'), JSON.stringify({ ...source, previousRef }) + '\n', { flag: 'wx', mode: 0o600, flush: true })
      if (source.running) {
        docker(['stop', '--time', '90', source.id], 100_000)
        const stopped = inspect(source.id), state = object(stopped.State)
        if (stopped.Image !== source.image || state.Running !== false || state.OOMKilled !== false || state.ExitCode !== 0) throw new Error('Source application did not drain cleanly; maintenance remains active')
        restartOld = true
      } else if (oldExitCode !== 0) throw new Error('Stopped source application has an unclean exit; maintenance remains active')
      const stem = `pre-${request.sourceSha.slice(0, 12)}-${request.operationId}`
      const backupEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('BACKUP_')))
      run('bash', [join(policy, 'scripts/backup-storage.sh'), stem, '--already-stopped'], root,
        { ...backupEnv, BACKUP_ENVIRONMENT: 'stable', BACKUP_POLICY_ROOT: policy, BACKUP_WORKING_DIRECTORY: root, BACKUP_COMPOSE_FILE: composePath,
          BACKUP_CAPTURE_SERVICE: 'capture', BACKUP_TOOL_SERVICE: 'app', SOURCE_BUILD_ID: source.build, MAINTENANCE_LOCK_HELD: '1' }, 31 * 60_000)
      const manifest = object(JSON.parse(readFileSync(join(root, 'backups', `${stem}.manifest.json`), 'utf8')))
      if (manifest.formatVersion !== 2 || manifest.environment !== 'stable' || manifest.backupStem !== stem
        || manifest.sourceBuildId !== source.build || manifest.targetBuildId !== request.sourceSha
        || typeof manifest.validatedAt !== 'string' || !Number.isFinite(Date.parse(manifest.validatedAt))) throw new Error('Sealed backup does not bind the retained source and fixed formal target')
    } else {
      const network = object(object(targetConfig.networks).dependencies)
      if (network.external !== true || typeof network.name !== 'string' || !network.name) throw new Error('Empty-storage proof requires the configured external dependency network')
      const names = ['DATABASE_URL', 'DATABASE_SCHEMA', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_PREFIX', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
      const entries = names.flatMap(name => {
        const value = targetEnv[name]
        if (value === undefined || value === null) return []
        if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('Empty-storage environment must contain single-line values')
        return [`${name}=${value}`]
      })
      const environmentPath = join(request.stage, 'empty-storage.env')
      writeFileSync(environmentPath, entries.join('\n') + '\n', { flag: 'wx', mode: 0o600, flush: true })
      const limits = request.budget.import.intake
      const proofDeadline = Date.now() + Math.min(90_000, Math.max(1, Math.floor(deadline - performance.now())))
      const id = run('docker', ['create', '--pull', 'never', '--read-only',
        '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--label', `org.open-agricola.backend-operation=${request.operationId}`, '--label', 'org.open-agricola.backend-phase=empty-proof',
        '--memory', `${limits.memoryMiB}m`, '--memory-swap', `${limits.memoryMiB}m`, '--cpus', String(limits.cpus), '--pids-limit', String(limits.pids),
        '--network', network.name, '--user', `${process.getuid?.()}:${process.getgid?.()}`, '--env-file', environmentPath,
        '--env', `GAME_BUILD_ID=${request.sourceSha}`, '--env', 'NODE_ENV=production', '--env', `BACKUP_DEADLINE_EPOCH_MS=${proofDeadline}`, image,
        'node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', 'check-empty', request.sourceSha, '--applications-stopped'], root, env)
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Empty-storage tool returned no native container identity')
      const remove = () => execute('docker', ['rm', '-f', '-v', id], root, process.env, 30_000)
      let proof: Record<string, unknown>
      try {
        writeFileSync(join(request.stage, 'empty-storage-container.json'), JSON.stringify({ id, image, operationId: request.operationId, deadline: proofDeadline }) + '\n', { flag: 'wx', mode: 0o600, flush: true })
        proof = object(JSON.parse(run('docker', ['start', '-a', id], root, env, 120_000)))
      }
      catch (error) {
        try { remove() } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Empty-storage proof failed and its container cleanup could not be confirmed', { cause: cleanupError }) }
        throw error
      }
      remove()
      if (proof.formatVersion !== 1 || proof.targetBuildId !== request.sourceSha || proof.database !== 'empty' || proof.objects !== 'empty') throw new Error('Fixed target did not prove the new storage empty')
      writeFileSync(join(request.stage, 'empty-storage.json'), JSON.stringify(proof) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    }
    const storagePath = bootstrap ? join(request.stage, 'empty-storage.json') : join(root, 'backups', `pre-${request.sourceSha.slice(0, 12)}-${request.operationId}.manifest.json`)
    const sealedStorage = object(JSON.parse(privateBackendEvidence(storagePath).toString('utf8'))), liveStartedAt = Date.now()
    let progress: BackendProgress = { format: 1, operationId: request.operationId, bindingSha256: backendImageRequestBinding(request), phase: 'validating',
      liveStartedAt, updatedAt: liveStartedAt, validatorExitCode: null,
      composeSha256: backendEvidenceHash(privateBackendEvidence(composePath)), imageSha256: backendEvidenceHash(privateBackendEvidence(join(request.stage, 'image.json'))),
      storageSha256: backendEvidenceHash(privateBackendEvidence(storagePath)), sourceSha256: bootstrap ? null : backendEvidenceHash(privateBackendEvidence(join(request.stage, 'source.json'))),
      validationSha256: backendEvidenceHash(JSON.stringify(Object.fromEntries(validationKeys.map(key => [key, bootstrap ? key === 'replaySchemaVersions' ? [] : 0 : sealedStorage[key]])))) }
    writeBackendProgress(request, progress)
    installed.write('', bootstrap ? '' : undefined)
    restartOld = false
    const liveName = `oa-formal-live-${request.operationId}`
    const liveBudget = Math.min(30 * 60_000, Math.floor(deadline - performance.now()))
    if (liveBudget <= 0) throw new Error('Formal backend maintenance has no remaining target-validation budget')
    const removeLive = (): void => {
      const ids = execute('docker', ['ps', '-a', '-q', '--filter', `name=^/${liveName}$`], root).split('\n').filter(Boolean)
      for (const id of ids) {
        if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Live-validation cleanup returned an invalid native container identity')
        const values: unknown = JSON.parse(execute('docker', ['inspect', id], root))
        if (!Array.isArray(values) || values.length !== 1) throw new Error('Live-validation cleanup requires one native container')
        const container = object(values[0]), labels = object(object(container.Config).Labels)
        if (container.Id !== id || container.Image !== image || labels['org.open-agricola.backend-operation'] !== request.operationId
          || labels['org.open-agricola.backend-phase'] !== 'live-validation') throw new Error('Refusing to remove another live-validation container')
        execute('docker', ['rm', '-f', '-v', id], root)
      }
    }
    try {
      compose(['run', '--rm', '--name', liveName, '--label', `org.open-agricola.backend-operation=${request.operationId}`,
        '--label', 'org.open-agricola.backend-phase=live-validation', '--no-deps', '--pull', 'never',
        '-e', `BACKUP_DEADLINE_EPOCH_MS=${Date.now() + liveBudget}`, 'app', 'node', '--import', 'tsx',
        'scripts/storage-archive-cli.ts', 'check-live', request.sourceSha, '--applications-stopped'], liveBudget)
    } catch (error) {
      try { removeLive() }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Live target validation failed and its owned container cleanup could not be confirmed', { cause: cleanupError }) }
      throw error
    }
    progress = { ...progress, phase: 'starting', updatedAt: Math.max(progress.liveStartedAt, Date.now()), validatorExitCode: 0 }
    writeBackendProgress(request, progress)
    drainTarget = () => {
      const failures: unknown[] = []
      for (const service of bootstrap ? ['app', 'caddy'] : ['app']) {
        let ids: string[]
        try { ids = compose(['ps', '-a', '-q', service]).split('\n').filter(Boolean) }
        catch (error) { failures.push(error); continue }
        for (const id of ids) {
          try {
            if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Failed target application inventory is invalid')
            docker(['stop', '--time', '90', id], 100_000)
            if (object(inspect(id).State).Running !== false) throw new Error('Failed target application did not stop')
          } catch (error) { failures.push(error) }
        }
      }
      if (failures.length) throw new AggregateError(failures, 'Could not confirm every unaccepted target stopped')
    }
    compose(['up', '-d', '--remove-orphans', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app', 'caddy'], 150_000)
    const currentId = compose(['ps', '-q', 'app']), current = inspect(currentId), currentEnv = environment(object(current.Config).Env)
    if (current.Image !== image || object(current.State).Running !== true || object(current.State).OOMKilled !== false
      || currentEnv.GAME_BUILD_ID !== request.sourceSha || currentEnv.RELEASE_CHANNEL !== 'stable') throw new Error('Started application does not match the fixed formal image')
    const currentCaddy = inspect(compose(['ps', '-q', 'caddy']))
    if (currentCaddy.Image !== caddyImage || object(currentCaddy.State).Running !== true || object(currentCaddy.State).OOMKilled !== false) throw new Error('Started Caddy does not match the accepted immutable image')
    writeFileSync(join(root, 'data/deployed-build-id'), request.sourceSha + '\n', { mode: 0o600, flush: true })
    writeFileSync(join(root, 'data/deployed-image.json'), readFileSync(join(request.stage, 'image.json')), { mode: 0o600, flush: true })
    if (performance.now() > deadline) throw new Error('Formal backend maintenance deadline expired before publication')
    installed.write(image, caddyImage)
    drainTarget = undefined
    writeBackendProgress(request, { ...progress, phase: 'accepted', updatedAt: Math.max(progress.liveStartedAt, Date.now()) })
    const archives = readdirSync(join(root, 'backups')).filter(name => /^pre-[A-Za-z0-9._-]+\.tgz$/.test(name))
      .map(name => ({ name, modified: statSync(join(root, 'backups', name)).mtimeMs })).sort((a, b) => b.modified - a.modified)
    for (const [index, archive] of archives.entries()) {
      if (index < 5 && Date.now() - archive.modified <= 30 * 24 * 60 * 60_000) continue
      const stem = archive.name.slice(0, -4)
      for (const name of [archive.name, `${stem}.manifest.json`, `env-${stem}`]) if (existsSync(join(root, 'backups', name))) unlinkSync(join(root, 'backups', name))
    }
    try { unlinkSync(join(request.stage, 'image.tar')) }
    catch (error) { throw new Error('Backend deployment accepted, but its uploaded image archive could not be removed; inspect the retained private operation evidence', { cause: error }) }
    process.stdout.write(`Previous build: ${source?.build ?? 'none (explicit empty installation)'}\nCurrent build: ${request.sourceSha}\nFixed formal image: ${image}\nBackend maintenance deployment and target-build validation completed.\n`)
  } catch (error) {
    deadline = performance.now() + BACKEND_IMAGE_CLEANUP_MS
    if (drainTarget) {
      try { drainTarget() }
      catch (drainError) { throw new AggregateError([error], 'Target start failed and application drain could not be confirmed; inspect private operation evidence', { cause: drainError }) }
    }
    if (restartOld && source) {
      const current = inspect(source.id), state = object(current.State), env = environment(object(current.Config).Env)
      if (current.Image !== source.image || env.GAME_BUILD_ID !== source.build || state.Running !== false || state.OOMKilled !== false || state.ExitCode !== 0) throw new Error('Preflight failed and source identity changed; maintenance remains active', { cause: error })
      docker(['start', source.id])
      console.error('Preflight failed; restarted the unchanged source application')
    }
    throw error
  } finally { unpin() }
}

export type BackendOperationStatus = {
  kind: 'backend-image-operation'; operationId: string; sourceSha: string; producerSha: string; bindingSha256: string;
  state: 'running' | 'resumable' | 'accepted' | 'blocked' | 'unknown'; phase: 'prepared' | BackendProgress['phase'];
  nextAction: 'wait' | 'resume' | 'none' | 'inspect'; validatorExitCode: 0 | null; reason?: string;
}

class BackendEvidenceMismatch extends Error {}
function requireEvidence(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new BackendEvidenceMismatch(reason)
}
export const BACKEND_CHECKPOINT_QUERY = `import {PostgresDatabase} from './server/database/postgres.ts';
const db=new PostgresDatabase({connectionString:process.env.DATABASE_URL,schema:process.env.DATABASE_SCHEMA});
try{const result=await db.transaction(async()=>{
await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
await db.exec('SET LOCAL statement_timeout=8000');
const barrier=await db.prepare('SELECT status,report_json,updated_at FROM data_imports WHERE source_hash=?').get('target-build:'+process.argv[1]);
const bad=await db.prepare("SELECT count(*) AS count FROM data_imports WHERE status!='validated'").get();
const active=await db.prepare("SELECT count(*) AS count FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint").get();
const foreign=await db.prepare("SELECT count(*) AS count FROM app_instances WHERE status!='stopped' AND generation<>? AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint").get(process.argv[1]);
return {barrier,bad:Number(bad.count),active:Number(active.count),foreign:Number(foreign.count)};})();console.log(JSON.stringify(result));}finally{await db.close();}`
const validationKeys = ['roomCount', 'replayCount', 'replayHeadCount', 'replayStepCount', 'replaySegmentCount', 'retainedObjectCount', 'replaySchemaVersions']

function operationSummary(request: BackendImageRequest, progress?: BackendProgress): BackendOperationStatus {
  return { kind: 'backend-image-operation', operationId: request.operationId, sourceSha: request.sourceSha, producerSha: request.producerSha,
    bindingSha256: backendImageRequestBinding(request), state: 'unknown', phase: progress?.phase ?? 'prepared', nextAction: 'inspect', validatorExitCode: progress?.validatorExitCode ?? null }
}

function observeBackendOperation(path: string, expected: Target, workMs: number) {
  const { request, admission } = readBackendImageEvidence(path, expected), progress = readBackendProgress(request), root = request.directory
  requireEvidence(admission?.phase === 'running' && progress.liveStartedAt >= admission.startedAt && progress.liveStartedAt <= admission.workDeadline,
    'progress-outside-original-admission')
  requireEvidence(resolve(import.meta.dirname, '../..') === join(request.stage, 'policy'), 'staged-producer-required')
  const deadline = performance.now() + workMs
  const run = (command: string, args: string[], timeout = 30_000): string => {
    const remaining = Math.floor(deadline - performance.now())
    requireEvidence(remaining > 0, 'observation-deadline-expired')
    return execute(command, args, root, process.env, Math.min(remaining, timeout))
  }
  const docker = (args: string[]) => run('docker', args)
  const inspect = (id: string): Record<string, unknown> => {
    requireEvidence(/^[a-f0-9]{12,64}$/.test(id), 'invalid-native-container')
    const result: unknown = JSON.parse(docker(['inspect', id]))
    requireEvidence(Array.isArray(result) && result.length === 1, 'ambiguous-native-container')
    const value = object(result[0]); requireEvidence(value.Id === id, 'native-container-identity-changed'); return value
  }
  const policy = join(request.stage, 'policy')
  const tree = run('git', ['ls-tree', '-r', '--format=%(objectname)%x09%(path)', request.producerSha, 'package.json', 'scripts/ci', 'scripts/release', 'scripts/image-intake.ts', 'scripts/backup-storage.sh', 'scripts/backup-process.sh', 'scripts/backup-files.mjs'])
  requireEvidence(tree.length > 0, 'producer-policy-missing')
  for (const row of tree.split('\n')) {
    const [blob, file] = row.split('\t')
    requireEvidence(/^[a-f0-9]{40}$/.test(blob ?? '') && typeof file === 'string' && !file.split('/').includes('..'), 'invalid-producer-tree')
    const filePath = join(policy, file), info = lstatSync(filePath)
    requireEvidence(info.isFile() && !info.isSymbolicLink() && info.size <= 8 * 1024 * 1024, 'invalid-producer-file')
    const bytes = readFileSync(filePath), actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    requireEvidence(actual === blob, 'staged-producer-changed')
  }
  requireEvidence(run('git', ['rev-parse', 'HEAD']) === request.sourceSha && !run('git', ['status', '--porcelain', '--untracked-files=no']), 'candidate-source-changed')
  const composePath = join(request.stage, 'maintenance.compose.json'), composeBytes = privateBackendEvidence(composePath)
  requireEvidence(backendEvidenceHash(composeBytes) === progress.composeSha256
    && backendEvidenceHash(privateBackendEvidence(join(request.stage, 'image.json'))) === progress.imageSha256, 'staged-image-or-compose-changed')
  const config = object(JSON.parse(composeBytes.toString('utf8'))), services = object(config.services), app = object(services.app), caddy = object(services.caddy), targetEnv = object(app.environment)
  const image = inspectReceivedBackendImage(path, expected, docker)
  requireEvidence(typeof config.name === 'string' && !!config.name && app.image === image && app.pull_policy === 'never' && !app.build
    && caddy.pull_policy === 'never' && !caddy.build && typeof caddy.image === 'string' && /^sha256:[a-f0-9]{64}$/.test(caddy.image)
    && targetEnv.GAME_BUILD_ID === request.sourceSha && targetEnv.RELEASE_CHANNEL === 'stable', 'staged-native-target-changed')
  const compose = (args: string[], timeout?: number): string => run('docker', ['compose', '-f', composePath, ...args], timeout)
  const live = docker(['ps', '-a', '-q', '--filter', `name=^/oa-formal-live-${request.operationId}$`]).split('\n').filter(Boolean)
  requireEvidence(live.length === 0, 'validator-still-present')
  const installed = installedImageBinding(root)
  const appIds = compose(['ps', '-a', '-q', 'app']).split('\n').filter(Boolean)
  requireEvidence(appIds.length === 1 || request.installation.kind === 'bootstrap' && appIds.length === 0, 'ambiguous-application-inventory')
  const current = appIds.length ? inspect(appIds[0]) : null, currentState = current ? object(current.State) : { Running: false }, currentEnv = current ? environment(object(current.Config).Env) : {}
  const running = currentState.Running === true
  const currentLabels = current ? object(object(current.Config).Labels) : {}
  const exactTarget = current !== null && current.Image === image && currentEnv.GAME_BUILD_ID === request.sourceSha && currentEnv.RELEASE_CHANNEL === 'stable'
    && currentLabels['com.docker.compose.project'] === config.name && currentLabels['com.docker.compose.service'] === 'app'
    && currentLabels['org.open-agricola.backend-operation'] === request.operationId
  const nativeTarget = running && exactTarget
  requireEvidence(!running || nativeTarget, 'foreign-application-running')
  if (nativeTarget) {
    requireEvidence(currentState.OOMKilled === false && object(currentState.Health).Status === 'healthy', 'target-not-healthy')
  } else if (exactTarget) {
    requireEvidence(currentState.Running === false && currentState.OOMKilled === false && currentState.ExitCode === 0, 'stopped-target-not-clean')
  } else if (request.installation.kind !== 'bootstrap') {
    const source = object(JSON.parse(privateBackendEvidence(join(request.stage, 'source.json')).toString('utf8')))
    requireEvidence(current !== null && current.Id === source.id, 'unknown-stopped-application')
    const old = current, oldState = object(old.State), oldEnv = environment(object(old.Config).Env)
    requireEvidence(old.Image === source.image && oldEnv.GAME_BUILD_ID === source.build && oldState.Running === false
      && oldState.OOMKilled === false && oldState.ExitCode === 0, 'retained-source-not-cleanly-stopped')
  } else requireEvidence(current === null, 'unknown-bootstrap-application')
  const caddyId = compose(['ps', '-a', '-q', 'caddy']), currentCaddy = caddyId ? inspect(caddyId) : null
  requireEvidence(currentCaddy ? currentCaddy.Image === caddy.image && object(currentCaddy.State).OOMKilled === false : request.installation.kind === 'bootstrap', 'caddy-native-image-changed')
  const probeName = `oa-formal-status-${request.operationId}-${randomUUID().slice(0, 8)}`
  let proof: Record<string, unknown>
  try {
    proof = object(JSON.parse(compose(['run', '--rm', '--name', probeName, '--label', `org.open-agricola.backend-operation=${request.operationId}`,
      '--label', 'org.open-agricola.backend-phase=status-query', '--no-deps', '--pull', 'never', 'app', 'node', '--import', 'tsx', '--input-type=module', '-e', BACKEND_CHECKPOINT_QUERY, request.sourceSha], 60_000)))
  } finally {
    const cleanupDeadline = performance.now() + 30_000
    const cleanup = (args: string[]) => {
      const remaining = Math.floor(cleanupDeadline - performance.now())
      requireEvidence(remaining > 0, 'status-query-cleanup-deadline-expired')
      return execute('docker', args, root, process.env, remaining)
    }
    const ids = cleanup(['ps', '-a', '-q', '--filter', `name=^/${probeName}$`]).split('\n').filter(Boolean)
    requireEvidence(ids.length <= 1, 'ambiguous-status-query-container')
    for (const id of ids) {
      requireEvidence(/^[a-f0-9]{12,64}$/.test(id), 'invalid-status-query-container')
      const values: unknown = JSON.parse(cleanup(['inspect', id]))
      requireEvidence(Array.isArray(values) && values.length === 1, 'invalid-status-query-inspection')
      const container = object(values[0]), labels = object(object(container.Config).Labels)
      requireEvidence(container.Id === id && container.Image === image && labels['org.open-agricola.backend-operation'] === request.operationId
        && labels['org.open-agricola.backend-phase'] === 'status-query', 'foreign-status-query-container')
      cleanup(['rm', '-f', '-v', id])
    }
  }
  const barrier = object(proof.barrier), report = object(JSON.parse(String(barrier.report_json)))
  requireEvidence(barrier.status === 'validated' && typeof barrier.updated_at === 'number' && barrier.updated_at >= progress.liveStartedAt
    && barrier.updated_at <= Date.now() + 60_000 && proof.bad === 0 && proof.foreign === 0
    && typeof proof.active === 'number' && (nativeTarget || proof.active === 0), 'live-checkpoint-or-writers-invalid')
  requireEvidence(Object.keys(report).sort().join(',') === [...validationKeys].sort().join(',')
    && backendEvidenceHash(JSON.stringify(Object.fromEntries(validationKeys.map(key => [key, report[key]])))) === progress.validationSha256, 'live-validation-report-changed')
  const published = installed.image === image && installed.caddyImage === caddy.image
  requireEvidence(installed.image === null || published, 'installed-selector-changed')
  requireEvidence(installed.caddyImage === null || installed.caddyImage === caddy.image, 'installed-caddy-selector-changed')
  const markers = existsSync(join(root, 'data/deployed-build-id')) && readFileSync(join(root, 'data/deployed-build-id'), 'utf8').trim() === request.sourceSha
    && existsSync(join(root, 'data/deployed-image.json')) && backendEvidenceHash(readFileSync(join(root, 'data/deployed-image.json'))) === progress.imageSha256
  const caddyRunning = currentCaddy !== null && object(currentCaddy.State).Running === true
  const accepted = nativeTarget && published && markers && caddyRunning
  const result = { request, progress, image, caddyImage: caddy.image, installed, compose, inspect, nativeTarget, caddyRunning, accepted, deadline,
    status: { ...operationSummary(request, progress), state: accepted ? 'accepted' as const : 'resumable' as const, nextAction: accepted ? 'none' as const : 'resume' as const } }
  if (accepted && progress.phase === 'accepted') return result
  let storage: Record<string, unknown>
  if (request.installation.kind === 'bootstrap') {
    const bytes = privateBackendEvidence(join(request.stage, 'empty-storage.json'))
    requireEvidence(progress.sourceSha256 === null && backendEvidenceHash(bytes) === progress.storageSha256, 'empty-storage-proof-changed')
    const empty = object(JSON.parse(bytes.toString('utf8')))
    requireEvidence(empty.targetBuildId === request.sourceSha && empty.database === 'empty' && empty.objects === 'empty', 'empty-storage-proof-invalid')
    storage = Object.fromEntries(validationKeys.map(key => [key, key === 'replaySchemaVersions' ? [] : 0]))
  } else {
    const sourceBytes = privateBackendEvidence(join(request.stage, 'source.json'))
    requireEvidence(backendEvidenceHash(sourceBytes) === progress.sourceSha256, 'retained-source-evidence-changed')
    const source = object(JSON.parse(sourceBytes.toString('utf8'))), capture = object(services.capture), captureEnv = object(capture.environment)
    requireEvidence(capture.image === source.image && capture.pull_policy === 'never' && !capture.build, 'retained-source-image-changed')
    for (const key of ['DATABASE_URL', 'DATABASE_SCHEMA', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_PREFIX', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      requireEvidence((targetEnv[key] ?? '') === (captureEnv[key] ?? ''), 'retained-data-target-changed')
    }
    const stem = `pre-${request.sourceSha.slice(0, 12)}-${request.operationId}`, bytes = privateBackendEvidence(join(root, 'backups', `${stem}.manifest.json`))
    requireEvidence(backendEvidenceHash(bytes) === progress.storageSha256, 'sealed-backup-changed')
    storage = object(JSON.parse(bytes.toString('utf8')))
    requireEvidence(storage.formatVersion === 2 && storage.environment === 'stable' && storage.backupStem === stem
      && storage.sourceBuildId === source.build && storage.targetBuildId === request.sourceSha && typeof storage.validatedAt === 'string'
      && Date.parse(storage.validatedAt) <= progress.liveStartedAt, 'sealed-backup-binding-changed')
    for (const [file, digest, size] of [[`${stem}.tgz`, storage.archiveSha256, storage.archiveSizeBytes], [`env-${stem}`, storage.configurationSha256, storage.configurationSizeBytes]]) {
      requireEvidence(typeof file === 'string' && typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest) && typeof size === 'number', 'sealed-backup-file-invalid')
      const filePath = join(root, 'backups', file), info = lstatSync(filePath)
      requireEvidence(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid?.() && info.nlink === 1 && !(info.mode & 0o077)
        && info.size === size && run('sha256sum', [filePath], 120_000).split(/\s/)[0] === digest, 'sealed-backup-file-changed')
    }
  }
  requireEvidence(Object.keys(report).sort().join(',') === [...validationKeys].sort().join(',')
    && validationKeys.every(key => JSON.stringify(report[key]) === JSON.stringify(storage[key])), 'live-validation-report-changed')
  return result
}

export function backendImageOperationStatus(path: string, expected: Target): BackendOperationStatus {
  const { request } = readBackendImageEvidence(path, expected)
  let progress: BackendProgress | undefined
  try {
    progress = readBackendProgress(request)
    return observeBackendOperation(path, expected, 120_000).status
  } catch (error) {
    return { ...operationSummary(request, progress), state: error instanceof BackendEvidenceMismatch ? error.message === 'validator-still-present' ? 'running' : 'blocked' : 'unknown',
      nextAction: error instanceof BackendEvidenceMismatch && error.message === 'validator-still-present' ? 'wait' : 'inspect',
      reason: error instanceof BackendEvidenceMismatch ? error.message : 'native-evidence-unavailable-or-invalid' }
  }
}

export function resumeBackendImage(path: string, expected: Target, authorization: string): BackendOperationStatus {
  const { request } = readBackendImageEvidence(path, expected), workMs = validateBackendResumeAuthorization(authorization, request)
  requireEvidence(process.env.BACKEND_CONTINUATION_OPERATION === request.operationId, 'continuation-requires-operation-lock')
  const observed = observeBackendOperation(path, expected, workMs), { progress, image, caddyImage, installed, compose, inspect } = observed
  let accepted = observed.accepted
  try {
    if (!observed.accepted) {
      if (!observed.nativeTarget || !observed.caddyRunning) compose(['up', '-d', '--remove-orphans', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app', 'caddy'], 150_000)
      const current = inspect(compose(['ps', '-q', 'app'])), env = environment(object(current.Config).Env), state = object(current.State)
      requireEvidence(current.Image === image && state.Running === true && state.OOMKilled === false && object(state.Health).Status === 'healthy'
        && env.GAME_BUILD_ID === request.sourceSha && env.RELEASE_CHANNEL === 'stable', 'started-target-identity-changed')
      const caddy = inspect(compose(['ps', '-q', 'caddy']))
      requireEvidence(caddy.Image === caddyImage && object(caddy.State).Running === true && object(caddy.State).OOMKilled === false, 'started-caddy-identity-changed')
      requireEvidence(performance.now() < observed.deadline, 'continuation-deadline-expired-before-acceptance')
      writeFileSync(join(request.directory, 'data/deployed-build-id'), request.sourceSha + '\n', { mode: 0o600, flush: true })
      writeFileSync(join(request.directory, 'data/deployed-image.json'), privateBackendEvidence(join(request.stage, 'image.json')), { mode: 0o600, flush: true })
      installed.write(image, caddyImage)
      accepted = true
    }
    writeBackendProgress(request, { ...progress, phase: 'accepted', updatedAt: Math.max(progress.liveStartedAt, Date.now()) })
    const archive = join(request.stage, 'image.tar')
    if (existsSync(archive)) unlinkSync(archive)
    return { ...operationSummary(request, { ...progress, phase: 'accepted' }), state: 'accepted', nextAction: 'none' }
  } catch (error) {
    if (!accepted) {
      const cleanupDeadline = performance.now() + BACKEND_IMAGE_CLEANUP_MS
      const cleanup = (args: string[]) => {
        const remaining = Math.floor(cleanupDeadline - performance.now())
        requireEvidence(remaining > 0, 'continuation-cleanup-deadline-expired')
        return execute('docker', args, request.directory, process.env, remaining)
      }
      try {
        const failures: unknown[] = [], project = object(JSON.parse(privateBackendEvidence(join(request.stage, 'maintenance.compose.json')).toString('utf8'))).name
        for (const service of request.installation.kind === 'bootstrap' ? ['app', 'caddy'] : ['app']) {
          let ids: string[]
          try { ids = cleanup(['compose', '-f', join(request.stage, 'maintenance.compose.json'), 'ps', '-a', '-q', service]).split('\n').filter(Boolean) }
          catch (inspectionError) { failures.push(inspectionError); continue }
          for (const id of ids) {
            try {
              requireEvidence(/^[a-f0-9]{12,64}$/.test(id), 'invalid-unaccepted-target')
              const values: unknown = JSON.parse(cleanup(['inspect', id]))
              requireEvidence(Array.isArray(values) && values.length === 1, 'ambiguous-unaccepted-target')
              const container = object(values[0]), config = object(container.Config), labels = object(config.Labels)
              requireEvidence(container.Id === id && container.Image === (service === 'app' ? image : caddyImage)
                && labels['com.docker.compose.project'] === project && labels['com.docker.compose.service'] === service
                && (service !== 'app' || environment(config.Env).GAME_BUILD_ID === request.sourceSha
                  && labels['org.open-agricola.backend-operation'] === request.operationId), 'unaccepted-target-identity-changed')
              cleanup(['stop', '--time', '90', id])
              const after: unknown = JSON.parse(cleanup(['inspect', id]))
              requireEvidence(Array.isArray(after) && after.length === 1 && object(after[0]).Id === id && object(object(after[0]).State).Running === false, 'unaccepted-target-did-not-stop')
            } catch (targetError) { failures.push(targetError) }
          }
        }
        if (failures.length) throw new AggregateError([error, ...failures], 'Could not confirm every unaccepted continuation target stopped', { cause: error })
      } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Backend continuation failed and target drain could not be confirmed', { cause: cleanupError }) }
    }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path, directory, sourceSha, producerSha, authorization] = process.argv.slice(2)
    if (!path || !directory || !sourceSha || !producerSha) throw new Error('Usage: backend-image-maintenance.ts maintain <request> <directory> <source> <producer>')
    const expected = { directory, sourceSha, producerSha }
    if (mode === 'maintain') {
      const request = admitBackendImageOperation(path, 'maintenance', expected)
      const result = spawnSync('flock', ['-w', String(BACKEND_IMAGE_QUEUE_WAIT_MS / 1000), join(directory, 'backups/.maintenance.lock'), process.execPath, fileURLToPath(import.meta.url), '_locked', path, directory, sourceSha, producerSha],
        { stdio: 'inherit', timeout: BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS - 60_000, env: { ...process.env, BACKEND_MAINTENANCE_OPERATION: request.operationId } })
      if (result.error || result.status !== 0) throw new Error('Fixed image maintenance failed; inspect the private operation evidence before retrying')
    } else if (mode === 'status' || mode === 'resume') {
      const { request } = readBackendImageEvidence(path, expected)
      if (mode === 'resume' && !authorization) throw new Error('Backend resume requires fresh continuation authorization')
      const lockPath = join(directory, 'backups/.maintenance.lock')
      if (!existsSync(lockPath)) {
        if (mode === 'resume') throw new Error('Backend operation lock is missing; continuation is refused')
        console.log(JSON.stringify({ ...operationSummary(request), reason: 'operation-lock-missing' }))
        process.exit(0)
      }
      const result = spawnSync('flock', ['-n', '-E', '75', lockPath, process.execPath, fileURLToPath(import.meta.url),
        mode === 'status' ? '_status' : '_resume', path, directory, sourceSha, producerSha, ...(authorization ? [authorization] : [])],
      { stdio: 'inherit', timeout: BACKEND_RESUME_WORK_MS + BACKEND_IMAGE_CLEANUP_MS + 30_000, env: { ...process.env, BACKEND_CONTINUATION_OPERATION: request.operationId } })
      if (result.status === 75) {
        let progress: BackendProgress | undefined
        try { progress = readBackendProgress(request) } catch { /* The first journal is written only after storage is sealed. */ }
        console.log(JSON.stringify({ ...operationSummary(request, progress), state: 'running', nextAction: 'wait' }))
      }
      else if (result.error || result.status !== 0) throw new Error('Backend observation or continuation failed; inspect private operation evidence')
    } else if (mode === '_status') {
      console.log(JSON.stringify(backendImageOperationStatus(path, expected)))
    } else if (mode === '_resume' && authorization) {
      try { console.log(JSON.stringify(resumeBackendImage(path, expected, authorization))) }
      catch (error) { throw new Error(error instanceof BackendEvidenceMismatch ? error.message : 'Backend continuation evidence or execution failed; inspect private evidence', { cause: error }) }
    } else if (mode === '_locked') {
      startBackendImageOperation(path, { kind: 'maintenance', target: expected, operationId: process.env.BACKEND_MAINTENANCE_OPERATION ?? '' })
      maintainBackendImage(path, expected)
    }
    else throw new Error('Backend maintenance requires its operation lock')
  } catch (error) { console.error(error instanceof Error ? error.message : 'Formal image maintenance failed'); process.exitCode = 1 }
}
