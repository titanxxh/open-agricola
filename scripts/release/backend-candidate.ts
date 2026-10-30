import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCandidateVerification } from '../ci/candidate-verification'
import { candidateSha, ownerMachine, RELEASE_REPOSITORY } from './candidate'

export function backendCandidate(cwd: string, input: string[]): string {
  ownerMachine()
  if (input.length > 1) throw new Error('Usage: backend-candidate.ts [ref]')
  const repository = process.env.RELEASE_REPOSITORY ?? RELEASE_REPOSITORY
  const sha = candidateSha(cwd, repository, input[0] ?? 'main')
  const result = checkCandidateVerification(cwd, repository, sha)
  if (result.status !== 'passed') {
    throw new Error(`Full GitHub verification is incomplete for ${sha}: ${result.tasks.filter(task => task.status !== 'passed').map(task => task.id).join(',')}`)
  }
  console.error(`Verified backend candidate: ${sha}`)
  return sha
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(backendCandidate(process.cwd(), process.argv.slice(2)) + '\n') }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
