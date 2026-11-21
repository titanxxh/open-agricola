import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCandidateVerification } from './candidate-acceptance.ts'
import { admitFinalSnapshot } from './candidate-admission.ts'
import {
  assertCandidateCheckout, candidateManifest, pullFixtureImages, requestCandidateVerification, runRehearsalCandidateTask,
  runStableCandidateTask, trustedStableProducer,
} from './candidate-execution.ts'
import { stableConfiguration, stableManifestBinding } from './candidate-format.ts'
import { candidateExecution, printVerificationOutput } from './candidate-isolation.ts'
import { fullSha, selectedTasks, taskFixtureImages } from './verification-tasks.ts'

// The stable candidate verification CLI. The workflows and the release tools call its subcommands; execution,
// admission, the evidence format and acceptance live in the `candidate-*` modules beside it.

function options(input: string[]) {
  const result = new Map<string, string>()
  for (let index = 0; index < input.length; index++) {
    const key = input[index]
    if (key === '--json') continue
    if (!['--sha', '--repository', '--ref', '--tasks', '--producer', '--candidate-directory'].includes(key) || result.has(key)) throw new Error(`Unexpected candidate option: ${key}`)
    const value = input[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    result.set(key, value)
  }
  return (key: string, fallback?: string): string => {
    const value = result.get(key) ?? fallback
    if (!value) throw new Error(`Missing candidate option ${key}`)
    return value
  }
}

export function candidateVerificationCli(cwd: string, input: string[]): number {
  const [mode, ...remaining] = input
  const id = mode === 'run-task' || mode === 'formal-run-task' || mode === 'pull-fixture-images' ? remaining.shift() : null
  const option = options(remaining)
  if (mode === 'pull-fixture-images') {
    // The candidate's rootless Docker daemon pulls the public images the task's planned files start, with the trusted
    // Docker CLI and download retries, so a registry stall cannot fail or slow the timed task.
    if (!id) throw new Error('Missing task')
    const candidate = resolve(cwd, option('--candidate-directory'))
    assertCandidateCheckout(candidate, fullSha(option('--sha')), fullSha(option('--producer')))
    const images = taskFixtureImages(candidate, id)
    if (images.length) pullFixtureImages(candidateExecution(), images)
    printVerificationOutput(JSON.stringify({ task: id, images })); return 0
  }
  const sha = fullSha(option('--sha'))
  if (mode === 'formal-manifest' || mode === 'formal-source' || mode === 'formal-run-task') {
    const producer = fullSha(option('--producer'))
    trustedStableProducer(producer)
    const candidate = resolve(cwd, option('--candidate-directory'))
    assertCandidateCheckout(candidate, sha, producer)
    if (mode !== 'formal-run-task') {
      const { repositoryId } = admitFinalSnapshot(candidate, option('--repository', process.env.GITHUB_REPOSITORY), sha)
      if (mode === 'formal-source') return 0
      const tasks = selectedTasks(option('--tasks', 'all')), configuration = stableConfiguration(candidate, sha, producer)
      const binding = stableManifestBinding(repositoryId, sha, configuration, producer, tasks)
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nproducer=${producer}\nconfiguration=${configuration}\nmatrix=${JSON.stringify({ task: tasks })}\ntasks=${tasks.join(',')}\nbinding=${binding}\n`)
      printVerificationOutput(JSON.stringify({ channel: 'stable', sha, producer, configuration, tasks, binding })); return 0
    }
    if (!id) throw new Error('Missing stable task')
    runStableCandidateTask(candidate, id, sha, producer)
    trustedStableProducer(producer); return 0
  }
  if (mode === 'source') {
    assertCandidateCheckout(cwd, sha)
    printVerificationOutput(JSON.stringify({ status: 'matched', sha }))
    return 0
  }
  if (mode === 'manifest') {
    const manifest = candidateManifest(cwd, sha, option('--tasks', 'all'))
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nconfiguration=${manifest.configuration}\nmatrix=${JSON.stringify(manifest.matrix)}\ntasks=${manifest.matrix.task.join(',')}\nbinding=${manifest.binding}\n`)
    }
    printVerificationOutput(JSON.stringify(manifest))
    return 0
  }
  if (mode === 'run-task' && id) {
    runRehearsalCandidateTask(cwd, id, sha)
    return 0
  }
  if (mode === 'check') {
    const result = checkCandidateVerification(cwd, option('--repository'), sha)
    printVerificationOutput(JSON.stringify(result, null, 2))
    return result.status === 'passed' ? 0 : 1
  }
  if (mode === 'request') {
    printVerificationOutput(JSON.stringify(requestCandidateVerification(cwd, option('--repository'), sha, option('--ref'), option('--tasks', 'all'))))
    return 0
  }
  throw new Error('Usage: candidate-verification.ts manifest|source|run-task|pull-fixture-images|check|request --sha <full SHA> [options]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = candidateVerificationCli(process.cwd(), process.argv.slice(2)) }
  catch (error) {
    printVerificationOutput(error instanceof Error ? error.message : String(error), 'stderr')
    process.exitCode = 1
  }
}
