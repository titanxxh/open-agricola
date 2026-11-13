import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fullSha } from '../ci/verification-tasks.ts'
import { pinBackendDocker, readBackendImageRequest, verifyReceivedBackendImage, type BackendImageRequest } from './backend-image-receiver.ts'

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
function validateTarget(path: string, expected: Target): BackendImageRequest {
  const request = readBackendImageRequest(path)
  if (request.directory !== expected.directory || request.sourceSha !== fullSha(expected.sourceSha)
    || request.producerSha !== fullSha(expected.producerSha)) throw new Error('Formal image request differs from the owner maintenance target')
  return request
}

export function maintainBackendImage(path: string, expected: Target): void {
  const request = validateTarget(path, expected), root = request.directory, policy = resolve(import.meta.dirname, '../..')
  if (policy !== join(request.stage, 'policy')) throw new Error('Maintenance controller must come from the staged trusted producer')
  const unpin = pinBackendDocker(request.stage)
  let restartOld = false
  let drainTarget: (() => void) | undefined
  let source: { id: string; image: string; build: string; running: boolean } | undefined
  const docker = (args: string[], timeout?: number): string => execute('docker', args, root, process.env, timeout)
  const inspect = (id: string): Record<string, unknown> => {
    const values: unknown = JSON.parse(docker(['inspect', id]))
    if (!Array.isArray(values) || values.length !== 1) throw new Error('Expected exactly one native application container')
    return object(values[0])
  }
  try {
    const image = verifyReceivedBackendImage(path, expected), installed = installedImageBinding(root)
    const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', APP_UID: String(process.getuid?.()), APP_GID: String(process.getgid?.()), BACKEND_IMAGE: image, GAME_BUILD_ID: request.sourceSha, RELEASE_CHANNEL: 'stable', CADDY_IMAGE: installed.caddyImage ?? 'caddy:alpine' }
    const git = (args: string[]): string => execute('git', args, root, env)
    const config = (): Record<string, unknown> => object(JSON.parse(execute('docker', ['compose', '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'], root, env)))
    if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Tracked local edits must be resolved before deployment')
    if (!existsSync(join(root, 'data/postgres-cutover.validated'))) throw new Error('Validate the PostgreSQL cutover before deployment')
    const previousRef = fullSha(git(['rev-parse', 'HEAD'])), sourceConfig = config(), sourceServices = object(sourceConfig.services)
    if (typeof sourceConfig.name !== 'string' || !sourceConfig.name) throw new Error('Source Compose project identity is missing')
    const oldId = execute('docker', ['compose', '-f', 'docker-compose.prod.yml', 'ps', '-a', '-q', 'app'], root, env)
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
    const caddyId = execute('docker', ['compose', '-f', 'docker-compose.prod.yml', 'ps', '-a', '-q', 'caddy'], root, env)
    let caddyImage: unknown
    if (request.installation.kind === 'bootstrap') {
      if (caddyId) throw new Error('Bootstrap requires no retained Caddy container')
      const values: unknown = JSON.parse(docker(['image', 'inspect', request.installation.caddyImage]))
      if (!Array.isArray(values) || values.length !== 1) throw new Error('Expected one preloaded immutable Caddy image')
      const caddy = object(values[0])
      if (caddy.Os !== 'linux' || caddy.Architecture !== 'amd64' || !Array.isArray(caddy.RepoDigests)
        || !caddy.RepoDigests.includes(request.installation.caddyImage)) throw new Error('Preloaded Caddy digest or platform differs from the explicit bootstrap input')
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
    const compose = (args: string[], timeout?: number): string => execute('docker', ['compose', '-f', composePath, ...args], root, env, timeout)
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
      execute('bash', [join(policy, 'scripts/backup-storage.sh'), stem, '--already-stopped'], root,
        { ...backupEnv, BACKUP_ENVIRONMENT: 'stable', BACKUP_POLICY_ROOT: policy, BACKUP_WORKING_DIRECTORY: root, BACKUP_COMPOSE_FILE: composePath,
          BACKUP_CAPTURE_SERVICE: 'capture', BACKUP_TOOL_SERVICE: 'app', SOURCE_BUILD_ID: source.build, MAINTENANCE_LOCK_HELD: '1' }, 31 * 60_000)
      const manifest = object(JSON.parse(readFileSync(join(root, 'backups', `${stem}.manifest.json`), 'utf8')))
      if (manifest.formatVersion !== 2 || manifest.environment !== 'stable' || manifest.backupStem !== stem
        || manifest.sourceBuildId !== source.build || manifest.targetBuildId !== request.sourceSha
        || typeof manifest.validatedAt !== 'string' || !Number.isFinite(Date.parse(manifest.validatedAt))) throw new Error('Sealed backup does not bind the retained source and fixed formal target')
    } else {
      const proof = object(JSON.parse(compose(['run', '--rm', '--no-deps', '--pull', 'never', 'app', 'node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', 'check-empty', request.sourceSha, '--applications-stopped'], 120_000)))
      if (proof.formatVersion !== 1 || proof.targetBuildId !== request.sourceSha || proof.database !== 'empty' || proof.objects !== 'empty') throw new Error('Fixed target did not prove the new storage empty')
      writeFileSync(join(request.stage, 'empty-storage.json'), JSON.stringify(proof) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    }
    installed.write('', bootstrap ? '' : undefined)
    restartOld = false
    compose(['run', '--rm', '--no-deps', '--pull', 'never', 'app', 'node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', 'check-live', request.sourceSha, '--applications-stopped'], 120_000)
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
    installed.write(image, caddyImage)
    drainTarget = undefined
    const archives = readdirSync(join(root, 'backups')).filter(name => /^pre-[A-Za-z0-9._-]+\.tgz$/.test(name))
      .map(name => ({ name, modified: statSync(join(root, 'backups', name)).mtimeMs })).sort((a, b) => b.modified - a.modified)
    for (const [index, archive] of archives.entries()) {
      if (index < 5 && Date.now() - archive.modified <= 30 * 24 * 60 * 60_000) continue
      const stem = archive.name.slice(0, -4)
      for (const name of [archive.name, `${stem}.manifest.json`, `env-${stem}`]) if (existsSync(join(root, 'backups', name))) unlinkSync(join(root, 'backups', name))
    }
    process.stdout.write(`Previous build: ${source?.build ?? 'none (explicit empty installation)'}\nCurrent build: ${request.sourceSha}\nFixed formal image: ${image}\nBackend maintenance deployment and target-build validation completed.\n`)
  } catch (error) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path, directory, sourceSha, producerSha] = process.argv.slice(2)
    if (!path || !directory || !sourceSha || !producerSha) throw new Error('Usage: backend-image-maintenance.ts maintain <request> <directory> <source> <producer>')
    const expected = { directory, sourceSha, producerSha }, request = validateTarget(path, expected)
    if (mode === 'maintain') {
      const result = spawnSync('flock', ['-w', '60', join(directory, 'backups/.maintenance.lock'), process.execPath, fileURLToPath(import.meta.url), '_locked', path, directory, sourceSha, producerSha],
        { stdio: 'inherit', timeout: 40 * 60_000, env: { ...process.env, BACKEND_MAINTENANCE_OPERATION: request.operationId } })
      if (result.error || result.status !== 0) throw new Error('Fixed image maintenance failed; inspect the private operation evidence before retrying')
    } else if (mode === '_locked' && process.env.BACKEND_MAINTENANCE_OPERATION === request.operationId) maintainBackendImage(path, expected)
    else throw new Error('Backend maintenance requires its operation lock')
  } catch (error) { console.error(error instanceof Error ? error.message : 'Formal image maintenance failed'); process.exitCode = 1 }
}
