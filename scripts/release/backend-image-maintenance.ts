import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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
    const image = verifyReceivedBackendImage(path, expected)
    const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', APP_UID: String(process.getuid?.()), APP_GID: String(process.getgid?.()), BACKEND_IMAGE: image, GAME_BUILD_ID: request.sourceSha, RELEASE_CHANNEL: 'stable' }
    const git = (args: string[]): string => execute('git', args, root, env)
    const config = (): Record<string, unknown> => object(JSON.parse(execute('docker', ['compose', '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'], root, env)))
    if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Tracked local edits must be resolved before deployment')
    if (!existsSync(join(root, 'data/postgres-cutover.validated'))) throw new Error('Validate the PostgreSQL cutover before deployment')
    const previousRef = fullSha(git(['rev-parse', 'HEAD'])), sourceConfig = config(), sourceServices = object(sourceConfig.services)
    if (typeof sourceConfig.name !== 'string' || !sourceConfig.name) throw new Error('Source Compose project identity is missing')
    const oldId = execute('docker', ['compose', '-f', 'docker-compose.prod.yml', 'ps', '-a', '-q', 'app'], root, env)
    if (!/^[a-f0-9]{12,64}$/.test(oldId)) throw new Error('Exactly one retained source application container is required')
    const old = inspect(oldId), oldState = object(old.State), oldConfig = object(old.Config), oldEnv = environment(oldConfig.Env)
    const labels = object(oldConfig.Labels)
    if (old.Id !== oldId || typeof old.Image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(old.Image)
      || labels['com.docker.compose.project'] !== sourceConfig.name || labels['com.docker.compose.service'] !== 'app'
      || typeof oldState.Running !== 'boolean' || oldState.OOMKilled !== false) throw new Error('Source application inventory or OOM boundary differs')
    source = { id: oldId, image: old.Image, build: fullSha(oldEnv.GAME_BUILD_ID ?? ''), running: oldState.Running }
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
    if (!/^[a-f0-9]{12,64}$/.test(caddyId)) throw new Error('Retained Caddy inventory is required')
    const caddyImage = inspect(caddyId).Image
    if (typeof caddyImage !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(caddyImage)) throw new Error('Invalid retained Caddy image')
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
    const capture = object(sourceServices.app)
    delete capture.build; delete capture.depends_on; delete capture.ports; delete capture.container_name
    services.capture = { ...capture, image: source.image, environment: oldEnv, pull_policy: 'never', profiles: ['maintenance'], restart: 'no' }
    targetConfig.services = services
    const composePath = join(request.stage, 'maintenance.compose.json')
    writeFileSync(composePath, JSON.stringify(targetConfig) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    const compose = (args: string[], timeout?: number): string => execute('docker', ['compose', '-f', composePath, ...args], root, env, timeout)
    writeFileSync(join(request.stage, 'source.json'), JSON.stringify({ ...source, previousRef }) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    if (source.running) {
      docker(['stop', '--time', '90', source.id], 100_000)
      const stopped = inspect(source.id), state = object(stopped.State)
      if (stopped.Image !== source.image || state.Running !== false || state.OOMKilled !== false || state.ExitCode !== 0) throw new Error('Source application did not drain cleanly; maintenance remains active')
      restartOld = true
    } else if (oldState.ExitCode !== 0) throw new Error('Stopped source application has an unclean exit; maintenance remains active')
    const stem = `pre-${request.sourceSha.slice(0, 12)}-${request.operationId}`
    const backupEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('BACKUP_')))
    execute('bash', [join(policy, 'scripts/backup-storage.sh'), stem, '--already-stopped'], root,
      { ...backupEnv, BACKUP_ENVIRONMENT: 'stable', BACKUP_POLICY_ROOT: policy, BACKUP_WORKING_DIRECTORY: root, BACKUP_COMPOSE_FILE: composePath,
        BACKUP_CAPTURE_SERVICE: 'capture', BACKUP_TOOL_SERVICE: 'app', SOURCE_BUILD_ID: source.build, MAINTENANCE_LOCK_HELD: '1' }, 31 * 60_000)
    const manifest = object(JSON.parse(readFileSync(join(root, 'backups', `${stem}.manifest.json`), 'utf8')))
    if (manifest.formatVersion !== 2 || manifest.environment !== 'stable' || manifest.backupStem !== stem
      || manifest.sourceBuildId !== source.build || manifest.targetBuildId !== request.sourceSha
      || typeof manifest.validatedAt !== 'string' || !Number.isFinite(Date.parse(manifest.validatedAt))) throw new Error('Sealed backup does not bind the retained source and fixed formal target')
    restartOld = false
    compose(['run', '--rm', '--no-deps', '--pull', 'never', 'app', 'node', '--import', 'tsx', 'scripts/storage-archive-cli.ts', 'check-live', request.sourceSha, '--applications-stopped'], 120_000)
    drainTarget = () => {
      const ids = compose(['ps', '-a', '-q', 'app']).split('\n').filter(Boolean)
      if (ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error('Failed target application inventory is invalid')
      for (const id of ids) {
        docker(['stop', '--time', '90', id], 100_000)
        if (object(inspect(id).State).Running !== false) throw new Error('Failed target application did not stop')
      }
    }
    compose(['up', '-d', '--remove-orphans', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app', 'caddy'], 150_000)
    const currentId = compose(['ps', '-q', 'app']), current = inspect(currentId), currentEnv = environment(object(current.Config).Env)
    if (current.Image !== image || object(current.State).Running !== true || object(current.State).OOMKilled !== false
      || currentEnv.GAME_BUILD_ID !== request.sourceSha || currentEnv.RELEASE_CHANNEL !== 'stable') throw new Error('Started application does not match the fixed formal image')
    writeFileSync(join(root, 'data/deployed-build-id'), request.sourceSha + '\n', { mode: 0o600, flush: true })
    writeFileSync(join(root, 'data/deployed-image.json'), readFileSync(join(request.stage, 'image.json')), { mode: 0o600, flush: true })
    drainTarget = undefined
    const archives = readdirSync(join(root, 'backups')).filter(name => /^pre-[A-Za-z0-9._-]+\.tgz$/.test(name))
      .map(name => ({ name, modified: statSync(join(root, 'backups', name)).mtimeMs })).sort((a, b) => b.modified - a.modified)
    for (const [index, archive] of archives.entries()) {
      if (index < 5 && Date.now() - archive.modified <= 30 * 24 * 60 * 60_000) continue
      const stem = archive.name.slice(0, -4)
      for (const name of [archive.name, `${stem}.manifest.json`, `env-${stem}`]) if (existsSync(join(root, 'backups', name))) unlinkSync(join(root, 'backups', name))
    }
    process.stdout.write(`Previous build: ${source.build}\nCurrent build: ${request.sourceSha}\nFixed formal image: ${image}\nBackend maintenance deployment and target-build validation completed.\n`)
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
