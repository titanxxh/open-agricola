import { createHash } from 'node:crypto'
import type { PlannedCheck, VerificationPlan } from './verification-plan'

export const BROWSER_PARTITION_IDS = ['browser-1', 'browser-2', 'browser-3', 'browser-4'] as const
export const ROUTINE_PARTITION_IDS = ['units', ...BROWSER_PARTITION_IDS] as const
export type RoutinePartitionId = typeof ROUTINE_PARTITION_IDS[number]
type BrowserCheck = Extract<PlannedCheck, { kind: 'browser' }>
type UnitCheck = Extract<PlannedCheck, { kind: 'vitest' }>
type BrowserTuple = Pick<BrowserCheck, 'browser' | 'grep'> & { file: string }
type BrowserSlot = { id: typeof BROWSER_PARTITION_IDS[number]; groups: Map<string, BrowserCheck> }
export type RoutinePartition =
  | { id: 'units'; digest: string; checks: UnitCheck[] }
  | { id: typeof BROWSER_PARTITION_IDS[number]; digest: string; checks: BrowserCheck[] }
export type RoutinePartitionDescriptor = { id: RoutinePartitionId; digest: string; checks: number }
export type RoutinePartitionManifest = Record<RoutinePartitionId, RoutinePartitionDescriptor | null>

const key = (tuple: BrowserTuple) => JSON.stringify([tuple.browser, tuple.grep, tuple.file])
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
const tuples = (checks: BrowserCheck[]): BrowserTuple[] => checks.flatMap(check =>
  check.files.map(file => ({ browser: check.browser, grep: check.grep, file })))
const digest = (id: RoutinePartitionId, checks: UnitCheck[] | BrowserCheck[]) =>
  createHash('sha256').update(JSON.stringify({ id, checks })).digest('hex')
const browserSlots = (): BrowserSlot[] => BROWSER_PARTITION_IDS.map(id => ({ id, groups: new Map() }))

function distribute(selected: BrowserTuple[], slots: BrowserSlot[]) {
  selected.forEach((tuple, index) => {
    const slot = slots[index % slots.length]
    const group = JSON.stringify([tuple.browser, tuple.grep])
    const check = slot.groups.get(group) ?? { kind: 'browser', browser: tuple.browser, grep: tuple.grep, files: [] }
    check.files.push(tuple.file)
    slot.groups.set(group, check)
  })
}

function selectorSlots(selected: BrowserTuple[]): BrowserSlot[] | undefined {
  const grouped = new Map<string, BrowserTuple[]>()
  for (const tuple of selected) {
    const group = JSON.stringify([tuple.browser, tuple.grep])
    const members = grouped.get(group) ?? []
    members.push(tuple)
    grouped.set(group, members)
  }
  if (!grouped.size || grouped.size > BROWSER_PARTITION_IDS.length) return undefined
  const groups = [...grouped].map(([key, tuples]) => ({ key, tuples, slots: 1 }))
  for (let allocated = groups.length; allocated < BROWSER_PARTITION_IDS.length; allocated++) {
    const next = [...groups].sort((left, right) =>
      right.tuples.length / right.slots - left.tuples.length / left.slots || compare(left.key, right.key))
      .find(group => group.slots < group.tuples.length)
    if (!next) break
    next.slots++
  }
  groups.sort((left, right) => right.tuples.length - left.tuples.length || compare(left.key, right.key))
  const slots = browserSlots()
  let offset = 0
  for (const group of groups) {
    distribute(group.tuples, slots.slice(offset, offset + group.slots))
    offset += group.slots
  }
  return slots
}

export function routinePartitions(plan: VerificationPlan): RoutinePartition[] {
  const result: RoutinePartition[] = []
  const units = plan.checks.filter(check => check.kind === 'vitest')
  if (units.length) result.push({ id: 'units', checks: units, digest: digest('units', units) })
  const selected = tuples(plan.checks.filter(check => check.kind === 'browser')).sort((left, right) => compare(key(left), key(right)))
  if (new Set(selected.map(key)).size !== selected.length) throw new Error('Duplicate scoped browser selection')
  const roundRobin = browserSlots()
  distribute(selected, roundRobin)
  const grouped = selectorSlots(selected)
  const commands = (slots: BrowserSlot[]) => slots.reduce((count, slot) => count + slot.groups.size, 0)
  const fileLimit = Math.ceil(selected.length / BROWSER_PARTITION_IDS.length) + 1
  const slots = grouped && commands(grouped) < commands(roundRobin)
    && grouped.every(slot => [...slot.groups.values()].reduce((count, check) => count + check.files.length, 0) <= fileLimit)
    ? grouped : roundRobin
  for (const slot of slots) {
    const checks = [...slot.groups.values()]
    if (checks.length) result.push({ id: slot.id, checks, digest: digest(slot.id, checks) })
  }
  const actual = tuples(result.flatMap(partition => partition.id === 'units' ? [] : partition.checks)).map(key).sort(compare)
  if (actual.length !== selected.length || selected.some((tuple, index) => key(tuple) !== actual[index])) {
    throw new Error('Scoped browser partitions do not cover the selected files exactly once')
  }
  return result
}

export function routinePartitionManifest(partitions: RoutinePartition[]): RoutinePartitionManifest {
  const manifest: RoutinePartitionManifest = { units: null, 'browser-1': null, 'browser-2': null, 'browser-3': null, 'browser-4': null }
  for (const partition of partitions) manifest[partition.id] = { id: partition.id, digest: partition.digest, checks: partition.checks.length }
  return manifest
}

export function executionPartition(value: string): 'all' | RoutinePartitionId {
  if (value === 'all') return value
  const id = ROUTINE_PARTITION_IDS.find(candidate => candidate === value)
  if (!id) throw new Error('Unknown execution partition')
  return id
}
