import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { canonicalOwnerLocalCommands } from './owner-local-execution.ts'
import {
  OWNER_LOCAL_CONTEXT, parseOwnerLocalReceipt, PRERELEASE_OWNER_LOCAL_CONTEXT,
  type LocalReceipt, type OwnerLocalReceipt, type PrereleaseOwnerLocalReceipt,
} from './owner-local-format.ts'
import { fullSha, verificationConfiguration } from './verification-tasks.ts'

// Admission of an owner-local receipt to a selected candidate: the native repository owner, the raw source trees,
// the verification configurations and the complete command plan the receipt must match.

/** `continuity` (prerelease only) accepts a receipt whose ancestor producer configuration differs from the selected producer. */
export type OwnerLocalSelection = { repository: string; repositoryId: number; candidateSha: string; producerSha: string; continuity?: boolean }

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner-local evidence object')
  return Object.fromEntries(Object.entries(value))
}
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid owner-local native identity')
  return value
}
const git = (cwd: string, args: string[]): Buffer => execFileSync('git', args, {
  cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
})

function rawTree(cwd: string, sha: string, repository: string): string {
  fullSha(sha)
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: 'ignore' }).status !== 0) {
    git(cwd, ['fetch', '--no-tags', `https://github.com/${repository}.git`, sha])
  }
  const body = git(cwd, ['cat-file', 'commit', sha])
  if (createHash('sha1').update(`commit ${body.length}\0`).update(body).digest('hex') !== sha) throw new Error('Owner-local commit does not match its raw SHA')
  const tree = /^tree ([a-f0-9]{40})\n/.exec(body.toString('utf8'))?.[1]
  if (!tree) throw new Error('Owner-local commit lacks its raw tree')
  return tree
}

/** Parses `value` and rebinds it to `selected.candidateSha` when its tree, configurations and plan all match. */
export function rebindLocalReceipt(cwd: string, value: unknown, selected: OwnerLocalSelection, channel: 'stable' | 'prerelease'): LocalReceipt {
  const receipt = parseOwnerLocalReceipt(value)
  if ((receipt.kind === PRERELEASE_OWNER_LOCAL_CONTEXT) !== (channel === 'prerelease')) throw new Error('Owner-local receipt channel differs')
  if (receipt.kind === PRERELEASE_OWNER_LOCAL_CONTEXT) {
    rawTree(cwd, receipt.producerSha, selected.repository)
    if (spawnSync('git', ['merge-base', '--is-ancestor', receipt.producerSha, selected.producerSha], { cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: 'ignore' }).status !== 0
      || verificationConfiguration(cwd, receipt.producerSha) !== receipt.producerConfiguration) throw new Error('Owner-local receipt producer is not compatible protected main')
  }
  if (receipt.repository !== selected.repository || receipt.repositoryId !== selected.repositoryId
    || receipt.tree !== rawTree(cwd, receipt.testedSha, selected.repository) || receipt.tree !== rawTree(cwd, receipt.candidateSha, selected.repository)
    || receipt.tree !== rawTree(cwd, selected.candidateSha, selected.repository)
    || receipt.configuration !== verificationConfiguration(cwd, receipt.testedSha)
    || receipt.configuration !== verificationConfiguration(cwd, selected.candidateSha)
    || !(selected.continuity === true && receipt.kind === PRERELEASE_OWNER_LOCAL_CONTEXT)
      && receipt.producerConfiguration !== verificationConfiguration(cwd, selected.producerSha)) throw new Error('Owner-local source tree or verification configuration differs')
  const commands = canonicalOwnerLocalCommands(cwd, receipt.testedSha, channel, receipt.kind === PRERELEASE_OWNER_LOCAL_CONTEXT ? receipt.producerSha : undefined)
  for (const task of receipt.tasks) {
    if (JSON.stringify(task.commands.map(({ command, args }) => ({ command, args }))) !== JSON.stringify(commands[task.id])) throw new Error(`Owner-local ${task.id} commands differ from the complete candidate plan`)
  }
  return { ...receipt, candidateSha: fullSha(selected.candidateSha) }
}

export function rebindOwnerLocalReceipt(cwd: string, value: unknown, selected: OwnerLocalSelection): OwnerLocalReceipt {
  const receipt = rebindLocalReceipt(cwd, value, selected, 'stable')
  if (receipt.kind !== OWNER_LOCAL_CONTEXT) throw new Error('Expected stable owner-local receipt')
  return receipt
}
export function rebindPrereleaseOwnerLocalReceipt(cwd: string, value: unknown, selected: OwnerLocalSelection): PrereleaseOwnerLocalReceipt {
  const receipt = rebindLocalReceipt(cwd, value, selected, 'prerelease')
  if (receipt.kind !== PRERELEASE_OWNER_LOCAL_CONTEXT) throw new Error('Expected prerelease owner-local receipt')
  return receipt
}

export function ownerLocalRepository(value: unknown, repository: string): { repositoryId: number; ownerId: number } {
  const input = object(value), owner = object(input.owner)
  if (input.full_name !== repository || owner.type !== 'User' || owner.login !== repository.split('/')[0]) throw new Error('Owner-local authority requires the native repository User owner')
  return { repositoryId: integer(input.id), ownerId: integer(owner.id) }
}
