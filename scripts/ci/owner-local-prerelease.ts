import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commitRef, ownerMachine, RELEASE_REPOSITORY } from '../release/candidate.ts'
import { assertCandidateCheckout } from './candidate-verification.ts'
import { rebindPrereleaseOwnerLocalReceipt, type PrereleaseOwnerLocalReceipt } from './owner-local-verification.ts'
import { admitPrereleaseSnapshot, runPrereleaseCandidateTask } from './prerelease-verification.ts'
import { FULL_TASK_IDS, fullSha, verificationConfiguration } from './verification-tasks.ts'

export function recordPrereleaseVerification(input: { candidateDirectory: string; sha: string; output: string }): void {
  ownerMachine()
  const policy = resolve(import.meta.dirname, '../..'), cwd = resolve(input.candidateDirectory), sha = fullSha(input.sha)
  const selected = admitPrereleaseSnapshot(policy, RELEASE_REPOSITORY, sha)
  assertCandidateCheckout(policy, selected.main)
  assertCandidateCheckout(cwd, sha, selected.main)
  if (commitRef(RELEASE_REPOSITORY, 'heads/prerelease') !== sha) throw new Error('Local qualification requires the current fixed prerelease')
  const output = resolve(input.output), parent = dirname(output), metadata = lstatSync(parent)
  if (!isAbsolute(input.output) || !metadata.isDirectory() || metadata.mode & 0o077 || realpathSync(parent) !== parent || existsSync(output)) {
    throw new Error('Use a new receipt path in an existing private owner directory')
  }
  const logs = mkdtempSync(join(parent, 'owner-local-logs-')), startedAt = new Date().toISOString()
  const tasks: PrereleaseOwnerLocalReceipt['tasks'] = []
  for (const id of FULL_TASK_IDS) {
    const task: PrereleaseOwnerLocalReceipt['tasks'][number] = { id, startedAt: new Date().toISOString(), completedAt: '', commands: [] }
    runPrereleaseCandidateTask(cwd, id, sha, selected.main, (command, args, directory, env) => {
      const path = join(logs, `${id}-${task.commands.length + 1}.log`), fd = openSync(path, 'wx', 0o600)
      let status: number
      try {
        process.stderr.write(`Owner-local prerelease ${id}: ${command} ${args.join(' ')}\n`)
        const result = spawnSync(command, args, { cwd: directory, env, stdio: ['ignore', fd, fd] })
        if (result.error) throw result.error
        status = result.status ?? 1
      } finally { closeSync(fd) }
      task.commands.push({ command: command === process.execPath ? 'node' : command, args, exitCode: status,
        logSha256: createHash('sha256').update(readFileSync(path)).digest('hex') })
      return status
    })
    task.completedAt = new Date().toISOString(); tasks.push(task)
    assertCandidateCheckout(policy, selected.main)
  }
  const current = admitPrereleaseSnapshot(policy, RELEASE_REPOSITORY, sha)
  if (current.main !== selected.main || current.repositoryId !== selected.repositoryId || commitRef(RELEASE_REPOSITORY, 'heads/prerelease') !== sha) {
    throw new Error('Protected producer or current prerelease changed during local qualification')
  }
  const receipt: PrereleaseOwnerLocalReceipt = { format: 1, kind: 'owner-local-prerelease-verification', channel: 'prerelease',
    repository: RELEASE_REPOSITORY, repositoryId: selected.repositoryId, testedSha: sha, candidateSha: sha, producerSha: selected.main,
    tree: execFileSync('git', ['rev-parse', `${sha}^{tree}`], { cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, encoding: 'utf8' }).trim(),
    configuration: verificationConfiguration(cwd, sha), producerConfiguration: verificationConfiguration(policy, selected.main),
    startedAt, completedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch, nodeExecutable: process.execPath }, tasks }
  const checked = rebindPrereleaseOwnerLocalReceipt(cwd, receipt, { repository: RELEASE_REPOSITORY, repositoryId: selected.repositoryId, candidateSha: sha, producerSha: selected.main })
  writeFileSync(output, JSON.stringify(checked) + '\n', { mode: 0o600, flag: 'wx' })
  process.stdout.write(JSON.stringify({ status: 'passed', channel: 'prerelease', sha, producerSha: selected.main, receipt: output, logs }) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...input] = process.argv.slice(2), args = new Map<string, string>()
    if (mode !== 'verify') throw new Error('Usage: owner-local-prerelease.ts verify --sha <SHA> --candidate-directory <clean C> --output <private receipt.json>')
    for (let index = 0; index < input.length; index++) {
      const key = input[index], value = input[++index]
      if (!['--sha', '--candidate-directory', '--output'].includes(key) || args.has(key) || !value || value.startsWith('--')) throw new Error('Invalid owner-local prerelease options')
      args.set(key, value)
    }
    const option = (key: string): string => { const value = args.get(key); if (!value) throw new Error(`Missing ${key}`); return value }
    recordPrereleaseVerification({ sha: option('--sha'), candidateDirectory: option('--candidate-directory'), output: option('--output') })
  } catch (error) { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1 }
}
