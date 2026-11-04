import { createHash } from 'node:crypto'
import type { PlannedCheck, VerificationPlan } from './verification-plan'

export const UNIT_PARTITION_IDS = ['units-1', 'units-2', 'units-3'] as const
export const BROWSER_PARTITION_IDS = ['browser-1', 'browser-2', 'browser-3', 'browser-4'] as const
export const ROUTINE_PARTITION_IDS = [...UNIT_PARTITION_IDS, ...BROWSER_PARTITION_IDS] as const
export type RoutinePartitionId = typeof ROUTINE_PARTITION_IDS[number]
type BrowserCheck = Extract<PlannedCheck, { kind: 'browser' }>
type UnitCheck = Extract<PlannedCheck, { kind: 'vitest' }>
type BrowserTuple = Pick<BrowserCheck, 'browser' | 'grep'> & { file: string }
export type RoutinePartition =
  | { id: typeof UNIT_PARTITION_IDS[number]; digest: string; checks: UnitCheck[] }
  | { id: typeof BROWSER_PARTITION_IDS[number]; digest: string; checks: BrowserCheck[] }
export type RoutinePartitionDescriptor = { id: RoutinePartitionId; digest: string; checks: number }
export type RoutinePartitionManifest = Record<RoutinePartitionId, RoutinePartitionDescriptor | null>

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
const tuples = (checks: BrowserCheck[]): BrowserTuple[] => checks.flatMap(check =>
  check.files.map(file => ({ browser: check.browser, grep: check.grep, file })))
const tupleKey = (tuple: BrowserTuple) => JSON.stringify([tuple.browser, tuple.grep, tuple.file])
const digest = (id: RoutinePartitionId, checks: UnitCheck[] | BrowserCheck[]) =>
  createHash('sha256').update(JSON.stringify({ id, checks })).digest('hex')

function pack<T>(items: T[], slots: number): T[][] {
  return Array.from({ length: slots }, (_, slot) => items.filter((_, index) => index % slots === slot))
}

export function routinePartitions(plan: VerificationPlan): RoutinePartition[] {
  const result: RoutinePartition[] = []
  const units = plan.checks.filter(check => check.kind === 'vitest')
  const files = units.flatMap(check => check.files.map(file => ({ project: check.project, file })))
    .sort((left, right) => compare(left.file, right.file) || compare(left.project, right.project))
  const unitBins = pack(files, UNIT_PARTITION_IDS.length)
  unitBins.forEach((bin, index) => {
    if (!bin.length) return
    const grouped = new Map<string, string[]>()
    for (const file of bin) {
      const members = grouped.get(file.project) ?? []
      members.push(file.file)
      grouped.set(file.project, members)
    }
    const checks = [...grouped.entries()].sort((left, right) => compare(left[0], right[0]))
      .map(([project, members]) => ({ kind: 'vitest' as const, project, files: members.sort(compare) }))
    const id = UNIT_PARTITION_IDS[index]
    result.push({ id, checks, digest: digest(id, checks) })
  })

  const selected = tuples(plan.checks.filter(check => check.kind === 'browser'))
    .sort((left, right) => compare(left.file, right.file) || compare(tupleKey(left), tupleKey(right)))
  if (new Set(selected.map(tupleKey)).size !== selected.length) throw new Error('Duplicate scoped browser selection')
  const browserBins = pack(selected, BROWSER_PARTITION_IDS.length)
  browserBins.forEach((bin, index) => {
    if (!bin.length) return
    const grouped = new Map<string, BrowserCheck>()
    for (const tuple of bin) {
      const key = JSON.stringify([tuple.browser, tuple.grep])
      const check = grouped.get(key) ?? { kind: 'browser', browser: tuple.browser, grep: tuple.grep, files: [] }
      check.files.push(tuple.file)
      grouped.set(key, check)
    }
    const checks = [...grouped.entries()].sort((left, right) => compare(left[0], right[0]))
      .map(([, check]) => ({ ...check, files: check.files.sort(compare) }))
    const id = BROWSER_PARTITION_IDS[index]
    result.push({ id, checks, digest: digest(id, checks) })
  })
  const actual = result.flatMap(partition => {
    if (partition.id !== 'browser-1' && partition.id !== 'browser-2' && partition.id !== 'browser-3' && partition.id !== 'browser-4') return []
    return tuples(partition.checks)
  }).map(tupleKey).sort(compare)
  const expected = selected.map(tupleKey).sort(compare)
  if (actual.length !== expected.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error('Scoped browser partitions do not cover the selected files exactly once')
  }
  return result
}

export function routinePartitionManifest(partitions: RoutinePartition[]): RoutinePartitionManifest {
  const manifest = Object.fromEntries(ROUTINE_PARTITION_IDS.map(id => [id, null])) as RoutinePartitionManifest
  for (const partition of partitions) manifest[partition.id] = { id: partition.id, digest: partition.digest, checks: partition.checks.length }
  return manifest
}

export function executionPartition(value: string): 'all' | RoutinePartitionId {
  if (value === 'all') return value
  const id = ROUTINE_PARTITION_IDS.find(candidate => candidate === value)
  if (!id) throw new Error('Unknown execution partition')
  return id
}
