import { FULL_TASK_IDS, fullSha, selectedTasks } from './verification-tasks'

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
  const selected = count(plan.outputs.inline_checks)
  const catalog = text(plan.outputs.catalog_tasks)
  const tasks = catalog ? selectedTasks(catalog).join(',') : ''
  if (tasks !== catalog || selected === 0 && !tasks) throw new Error('Verification task selection is empty or noncanonical')
  if (mode === 'full' && (selected !== 0 || tasks !== FULL_TASK_IDS.join(','))) throw new Error('Full fallback must execute every canonical task')
  const inline = job(needs.inline)
  if (selected > 0) {
    if (inline.result !== 'success' || inline.outputs.status !== 'passed'
      || inline.outputs.plan_digest !== digest || inline.outputs.tested_sha !== sha
      || count(inline.outputs.completed_checks) !== selected) {
      throw new Error('Selected inline checks did not all succeed for this plan and checkout')
    }
  } else if (inline.result !== 'skipped') throw new Error('The unselected inline branch must be skipped')
  const execution = job(needs.catalog)
  if (tasks) {
    if (execution.result !== 'success' || execution.outputs.verified_tasks !== tasks || execution.outputs.verified_sha !== sha) {
      throw new Error('Selected catalog tasks did not all succeed for this checkout')
    }
  } else if (execution.result !== 'skipped') throw new Error('The unselected catalog branch must be skipped')
  return { status: 'passed' as const, mode, sha, planDigest: digest }
}
