import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { backendCandidate } from './backend-candidate.ts'
import { BACKEND_IMAGE_INTAKE_OWNER_TIMEOUT_MS, BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS, parseBackendInstallation, readBackendImportBudget } from './backend-image-receiver.ts'
import { assertExpectedContainerImage, verifyContainerImageBuild } from './container-images.ts'
import { prepareContainerImageArchive } from './container-images-owner.ts'

const quote = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'"
function execute(command: string, args: string[], input?: string, timeout = 30_000): string {
  return execFileSync(command, args, { input, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

export async function backendImageDeployment(cwd: string, input: string[]): Promise<void> {
  const split = input.findIndex(value => value.startsWith('--')), positional = split < 0 ? input : input.slice(0, split)
  if (positional.length > 3) throw new Error('Usage: deploy-backend.sh [host] [ref] [remote-dir] --build-run N --build-attempt N --artifact-id N --auth-file FILE --import-budget FILE')
  const sourceSha = backendCandidate(cwd, [positional[1] ?? 'main'])
  const flags = split < 0 ? [] : input.slice(split), selected = new Map<string, string>()
  const required = ['--build-run', '--build-attempt', '--artifact-id', '--auth-file', '--import-budget']
  const names = [...required, '--bootstrap-caddy-image']
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index], value = flags[index + 1]
    if (!name || !names.includes(name) || !value || value.startsWith('--') || selected.has(name)) throw new Error('Invalid fixed formal image argument')
    selected.set(name, value)
  }
  if (required.some(name => !selected.has(name))) throw new Error('Fixed formal image evidence is required: --build-run, --build-attempt, --artifact-id, --auth-file and --import-budget')
  const installation = parseBackendInstallation(selected.has('--bootstrap-caddy-image') ? { kind: 'bootstrap', caddyImage: selected.get('--bootstrap-caddy-image') } : undefined)
  const integer = (name: string): number => {
    const value = selected.get(name) ?? ''
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid fixed formal image identifier')
    return Number(value)
  }
  const build = { cwd, runId: integer('--build-run'), runAttempt: integer('--build-attempt'), artifactId: integer('--artifact-id') }
  const budget = readBackendImportBudget(resolve(selected.get('--import-budget') ?? ''))
  let host = positional[0] ?? 'ubuntu@ten-kr'
  if (!host.includes('@')) host = `ubuntu@${host}`
  if (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(host)) throw new Error('Invalid backend SSH host')
  const directory = positional[2] ?? '/home/ubuntu/open-agricola'
  if (!/^\/[A-Za-z0-9_./-]+$/.test(directory) || resolve(directory) !== directory || directory === '/') throw new Error('Expected a canonical backend directory')
  const receipt = verifyContainerImageBuild(build), producerSha = receipt.producerSha
  assertExpectedContainerImage(receipt, { purpose: 'formal-candidate', sourceSha, producerSha })
  if (execute('git', ['-C', cwd, 'rev-parse', 'HEAD']) !== producerSha
    || execute('git', ['-C', cwd, 'status', '--porcelain', '--untracked-files=no'])) throw new Error('Run formal image delivery from the clean, exact image producer checkout')
  const local = mkdtempSync(join(tmpdir(), 'oa-formal-image-')), operationId = randomUUID()
  const exported = await prepareContainerImageArchive({ receipt, authFile: resolve(selected.get('--auth-file') ?? ''), directory: local, maxBytes: budget.import.maxArchiveMiB * 1024 * 1024 })
  const stage = join(directory, 'backups', `.backend-image-${operationId}`)
  const ssh = (args: string[], script?: string, timeout = 30_000): string => execute('ssh', [host, args.map(quote).join(' ')], script, timeout)
  const prepare = `set -euo pipefail
umask 077
export GIT_NO_REPLACE_OBJECTS=1
cd "$1"
[[ "$(pwd -P)" == "$1" ]] || { echo 'Backend directory contains an alias' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked local edits must be resolved before deployment' >&2; exit 1; }
[[ -f data/postgres-cutover.validated ]] || { echo 'Complete and validate the PostgreSQL cutover before deployment' >&2; exit 1; }
for sha in "$2" "$3"; do
  git fetch origin "$sha" >&2
  [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" == "$sha" ]] || { echo 'Fetched backend candidate mismatch' >&2; exit 1; }
done
mkdir -p backups
mkdir -m 700 "$4"
mkdir -m 700 "$4/policy"
git archive "$3" package.json scripts/ci scripts/release scripts/image-intake.ts scripts/backup-storage.sh scripts/backup-process.sh scripts/backup-files.mjs | tar -x -C "$4/policy"
printf '%s\\n' "$4"
`
  if (ssh(['bash', '-s', '--', directory, sourceSha, producerSha, stage], prepare, 120_000) !== stage) throw new Error('Backend returned another private image staging directory')
  const requestPath = join(local, 'request.json'), remoteRequest = join(stage, 'request.json')
  const request = { format: 1, operationId, directory, stage, sourceSha, producerSha, expiresAt: 0, installation, budget, transfer: exported.transfer }
  const authorize = (): void => {
    request.expiresAt = Date.now() + 300_000
    writeFileSync(requestPath, JSON.stringify(request) + '\n', { mode: 0o600, flush: true })
    execute('scp', ['-p', '--', requestPath, `${host}:${remoteRequest}`])
  }
  authorize()
  const receiver = join(stage, 'policy/scripts/release/backend-image-receiver.ts')
  const target = [remoteRequest, directory, sourceSha, producerSha]
  ssh(['node', receiver, 'preflight', ...target], undefined, 120_000)
  try { execute('scp', ['-p', '--', exported.archivePath, `${host}:${stage}/image.tar`], undefined, 20 * 60_000) }
  catch (error) {
    try { ssh(['node', receiver, 'discard-transfer', ...target], undefined, 120_000) }
    catch (cleanupError) { throw new AggregateError([error], `Formal image archive transfer failed and partial cleanup could not be confirmed; inspect ${stage}`, { cause: cleanupError }) }
    throw error
  }
  authorize()
  ssh(['node', receiver, 'receive', remoteRequest], undefined, BACKEND_IMAGE_INTAKE_OWNER_TIMEOUT_MS)
  if (backendCandidate(cwd, [sourceSha]) !== sourceSha || JSON.stringify(verifyContainerImageBuild(build)) !== JSON.stringify(receipt)) throw new Error('Formal image authority changed during transport')
  authorize()
  const env = ['env']
  if (process.env.ACCOUNT_REGISTRATION_POLICY) env.push(`ACCOUNT_REGISTRATION_POLICY=${process.env.ACCOUNT_REGISTRATION_POLICY}`)
  const result = ssh([...env, 'node', join(stage, 'policy/scripts/release/backend-image-maintenance.ts'), 'maintain', ...target], undefined, BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS)
  process.stdout.write(result + `\nOwner image evidence: ${local}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backendImageDeployment(process.cwd(), process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : 'Formal image deployment failed')
    process.exitCode = 1
  })
}
