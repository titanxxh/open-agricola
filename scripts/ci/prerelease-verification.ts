import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCandidateCheckout } from './candidate-execution.ts'
import { printVerificationOutput } from './candidate-isolation.ts'
import { checkPrereleaseVerification } from './prerelease-acceptance.ts'
import { admitPrereleaseSnapshot, fixPrereleaseCandidate, syncPrerelease } from './prerelease-admission.ts'
import { requestPrereleaseVerification, runPrereleaseCandidateTask, trustedPrereleaseProducer as trustedProducer } from './prerelease-execution.ts'
import { prereleaseCandidateRef, prereleaseConfiguration, prereleaseManifestBinding } from './prerelease-format.ts'
import { fullSha, selectedTasks } from './verification-tasks.ts'

// The prerelease candidate verification CLI. The workflow and the release tools call its subcommands; execution,
// admission, the evidence format and acceptance live in the `prerelease-*` modules beside it.

export function prereleaseVerificationCli(cwd: string, input: string[]): number {
  const [mode, ...rest] = input
  const args = new Map<string, string>()
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]; const value = rest[++i]
    if (!['--sha', '--repository', '--tasks', '--producer', '--candidate-directory', '--ref', '--expected-old', '--main-sha', '--task'].includes(key)
      || args.has(key) || !value || value.startsWith('--')) throw new Error('Invalid prerelease verification options')
    args.set(key, value)
  }
  const option = (key: string, fallback?: string): string => { const value = args.get(key) ?? fallback; if (!value) throw new Error(`Missing ${key}`); return value }
  const sha = fullSha(option('--sha'))
  const repository = option('--repository', process.env.GITHUB_REPOSITORY)
  if (mode === 'select') { fixPrereleaseCandidate(cwd, repository, sha); return 0 }
  if (mode === 'sync') { printVerificationOutput(JSON.stringify(syncPrerelease(cwd, repository, sha, option('--expected-old'), option('--main-sha')))); return 0 }
  if (mode === 'check') { const result = checkPrereleaseVerification(cwd, repository, sha); printVerificationOutput(JSON.stringify(result)); return result.status === 'passed' ? 0 : 1 }
  if (mode === 'request') { printVerificationOutput(JSON.stringify(requestPrereleaseVerification(cwd, repository, sha, option('--tasks', 'all')))); return 0 }
  const producer = fullSha(option('--producer'))
  trustedProducer(producer)
  const candidate = resolve(cwd, option('--candidate-directory'))
  assertCandidateCheckout(candidate, sha, producer)
  if (mode === 'manifest') {
    const source = admitPrereleaseSnapshot(candidate, repository, sha)
    if (option('--ref') !== prereleaseCandidateRef(sha)) throw new Error('Wrong immutable prerelease candidate ref')
    const tasks = selectedTasks(option('--tasks', 'all'))
    const configuration = prereleaseConfiguration(candidate, sha, producer)
    const binding = prereleaseManifestBinding(source.repositoryId, sha, configuration, producer, tasks)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nconfiguration=${configuration}\nmatrix=${JSON.stringify({ task: tasks })}\ntasks=${tasks.join(',')}\nbinding=${binding}\n`)
    printVerificationOutput(JSON.stringify({ channel: 'prerelease', sha, producer, configuration, tasks, binding }))
    return 0
  }
  if (mode === 'source') return 0
  if (mode === 'run-task') {
    runPrereleaseCandidateTask(candidate, option('--task'), sha, producer)
    trustedProducer(producer)
    return 0
  }
  throw new Error('Usage: prerelease-verification.ts select|check|request|sync|manifest|source|run-task --sha <SHA> [options]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = prereleaseVerificationCli(process.cwd(), process.argv.slice(2)) }
  catch (error) { printVerificationOutput(error instanceof Error ? error.message : String(error), 'stderr'); process.exitCode = 1 }
}
