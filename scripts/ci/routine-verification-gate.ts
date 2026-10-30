import { FULL_TASK_IDS, fullSha, selectedTasks } from './verification-tasks'
import { ROUTINE_PARTITION_IDS } from './routine-partitions'

export const NO_CATALOG_TASKS = 'none'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const object = (value: unknown) => {
  if (!isObject(value)) throw new Error('Missing or invalid verification job evidence')
  return value
}
const text = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('Missing verification job output')
  return value
}
const count = (value: unknown) => {
  const encoded = text(value)
  const parsed = Number(encoded)
  if (!/^(?:0|[1-9]\d*)$/.test(encoded) || !Number.isSafeInteger(parsed)) throw new Error('Invalid selected check count')
  return parsed
}
const job = (value: unknown) => {
  const input = object(value)
  return { result: text(input.result), outputs: object(input.outputs) }
}

function partitions(value: unknown) {
  const manifest = object(JSON.parse(text(value)))
  const keys = Object.keys(manifest).sort()
  if (keys.join(',') !== [...ROUTINE_PARTITION_IDS].sort().join(',')) throw new Error('Invalid routine partition manifest')
  return ROUTINE_PARTITION_IDS.map(id => {
    if (manifest[id] === null) return { id, expected: null }
    const input = object(manifest[id])
    const digest = text(input.digest)
    if (input.id !== id || !/^[a-f0-9]{64}$/.test(digest)
      || typeof input.checks !== 'number' || !Number.isSafeInteger(input.checks) || input.checks < 1) {
      throw new Error('Invalid routine partition manifest')
    }
    return { id, expected: { digest, checks: input.checks } }
  })
}

export function assertRoutineGate(input: { sha: string; needs: unknown }) {
  const sha = fullSha(input.sha)
  const needs = object(input.needs)
  const plan = job(needs.plan)
  if (plan.result !== 'success') throw new Error('Verification planning did not succeed')
  const mode = text(plan.outputs.mode)
  const digest = text(plan.outputs.plan_digest)
  if (mode !== 'scoped' && mode !== 'full' || !/^[a-f0-9]{64}$/.test(digest) || plan.outputs.tested_sha !== sha) {
    throw new Error('Verification plan identity or mode is invalid')
  }
  const selected = partitions(plan.outputs.partitions)
  const catalog = text(plan.outputs.catalog_tasks)
  const tasks = catalog === NO_CATALOG_TASKS ? '' : selectedTasks(catalog).join(',')
  const hasPartitions = selected.some(partition => partition.expected !== null)
  if (catalog !== NO_CATALOG_TASKS && tasks !== catalog || !hasPartitions && !tasks) {
    throw new Error('Verification task selection is empty or noncanonical')
  }
  if (mode === 'full' && (hasPartitions || tasks !== FULL_TASK_IDS.join(','))) throw new Error('Full fallback must execute every canonical task')
  for (const { id, expected } of selected) {
    const execution = job(needs[id])
    if (expected) {
      if (execution.result !== 'success' || execution.outputs.status !== 'passed'
        || execution.outputs.partition_id !== id || execution.outputs.partition_digest !== expected.digest
        || execution.outputs.plan_digest !== digest || execution.outputs.tested_sha !== sha
        || count(execution.outputs.completed_checks) !== expected.checks) {
        throw new Error(`Selected ${id} partition did not all succeed for this plan and checkout`)
      }
    } else if (execution.result !== 'skipped') throw new Error(`The unselected ${id} partition must be skipped`)
  }
  const execution = job(needs.catalog)
  if (tasks) {
    if (execution.result !== 'success' || execution.outputs.verified_tasks !== tasks || execution.outputs.verified_sha !== sha) {
      throw new Error('Selected catalog tasks did not all succeed for this checkout')
    }
  } else if (execution.result !== 'skipped') throw new Error('The unselected catalog branch must be skipped')
  return { status: 'passed' as const, mode, sha, planDigest: digest }
}
