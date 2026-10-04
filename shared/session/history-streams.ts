import { getHistoryParticipantRoles, registerHistoryRecordIdentity, type HistoryRecordIdentity } from '../projections/history-record-identity'
export { getHistoryRecordIdentity, inheritHistoryRecordIdentity, registerHistoryParticipantRoles, type HistoryRecordIdentity } from '../projections/history-record-identity'
import { isHistoryParticipantNameKey } from '../projections/history-names'
import type { GameState } from '../contract/types'

export const historyStreamKeys = ['log', 'events', 'publicEventArchive'] as const
export type HistoryStreamKind = typeof historyStreamKeys[number]
export type HistoryNode = {
  id: string
  kind: HistoryStreamKind
  previous: HistoryNode | null
  value: object
  identity: HistoryRecordIdentity
  length: number
}
export type HistoryBranch = { kind: HistoryStreamKind; head: HistoryNode | null; length: number }
const records = new WeakMap<object, { value: object; identity: HistoryRecordIdentity; links: Map<string, HistoryNode> }>()
const branches = new WeakMap<object, HistoryBranch>()
const groups = new WeakMap<object, string>()
const materialized = new WeakMap<HistoryBranch, object[]>()
const emptyStreams = new Map<HistoryStreamKind, object[]>()
const capturedRecords = new WeakSet<object>()
const capturedStreams = new WeakSet<object>()
const identifier = (): string => crypto.randomUUID()
const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Captured streams contain deeply frozen JSON records and cannot change in place. */
export const isCapturedHistoryStream = (value: object): boolean =>
  capturedStreams.has(value)

/** Only detached, deeply immutable JSON records may retain derived encodings. */
export const isCapturedHistoryRecord = (value: object): boolean => capturedRecords.has(value)

const isDeeplyFrozenJsonData = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || !Object.isFrozen(value) || ancestors.has(value)) return false
  ancestors.add(value)
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.hasOwn(value, 'map') || Object.hasOwn(value, 'constructor')) return false
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index)
      if (!descriptor || !('value' in descriptor) || !isDeeplyFrozenJsonData(descriptor.value, ancestors)) return false
    }
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (!('value' in descriptor) || !isDeeplyFrozenJsonData(descriptor.value, ancestors)) return false
    }
  }
  ancestors.delete(value)
  return true
}

const freeze = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.values(value).forEach(freeze)
  Object.freeze(value)
}

/** Identities live outside rule/Replay values. A continuation belongs to its complete action. */
export const beginHistoryOperation = (state: GameState, startsAction: boolean): void => {
  if (startsAction || !groups.has(state)) {
    const last = state.events.at(-1)
    const resumedGroup = last && records.get(last)?.identity.operationGroupId
    groups.set(state, !startsAction && resumedGroup ? resumedGroup : identifier())
  }
}

const roles = (value: object, state: Pick<GameState, 'players'>): Record<string, string> => {
  const result: Record<string, string> = {}
  const ids = new Set(state.players.map(player => player.id))
  const uniqueNames = new Map<string, string | null>()
  state.players.forEach(player => uniqueNames.set(player.name, uniqueNames.has(player.name) ? null : player.id))
  const visit = (entry: unknown, path: string): void => {
    if (!entry || typeof entry !== 'object') return
    for (const [key, child] of Object.entries(entry)) {
      const childPath = path ? `${path}.${key}` : key
      if (typeof child === 'string' && /(?:playerId|PlayerId)$/.test(key) && ids.has(child)) {
        result[childPath] = child
        const nameKey = key.slice(0, -2)
        if (typeof (entry as Record<string, unknown>)[nameKey] === 'string') result[path ? `${path}.${nameKey}` : nameKey] = child
      }
      if (typeof child === 'string' && isHistoryParticipantNameKey(key)) {
        const id = uniqueNames.get(child)
        if (id) result[childPath] = id
      }
      if (typeof child === 'object') visit(child, childPath)
    }
  }
  visit(value, '')
  Object.assign(result, getHistoryParticipantRoles(value))
  // Semantic references on the raw log take precedence over inferred event/name hints.
  const log = value as { playerId?: string; playerRefs?: Record<string, string> }
  if (log.playerId) {
    result['params.player'] = log.playerId
    result['params.playerName'] = log.playerId
  }
  for (const [key, playerId] of Object.entries(log.playerRefs ?? {})) {
    if (ids.has(playerId) && isHistoryParticipantNameKey(key)) result[`params.${key}`] = playerId
  }
  return result
}

export const historyBranch = (values: readonly object[], kind: HistoryStreamKind, state: Pick<GameState, 'players'>): HistoryBranch => {
  if (!groups.has(state)) groups.set(state, identifier())
  const cached = branches.get(values)
  if (cached?.kind === kind) return cached
  let head: HistoryNode | null = null
  const ordered = kind === 'log' ? [...values].reverse() : values
  let length = 0
  for (const entry of ordered) {
    length += 1
    let record = records.get(entry)
    if (!record) {
      const value = copyJson(entry)
      freeze(value)
      capturedRecords.add(value)
      record = { value, identity: { recordId: identifier(), operationGroupId: groups.get(state) ?? identifier(), participantRoles: roles(entry, state) }, links: new Map() }
      records.set(entry, record)
      records.set(value, record)
      registerHistoryRecordIdentity(entry, record.identity)
      registerHistoryRecordIdentity(value, record.identity)
    }
    const parentKey = `${kind}:${head?.id ?? ''}`
    let node = record.links.get(parentKey)
    if (!node) {
      node = { id: identifier(), kind, previous: head, value: record.value, identity: record.identity, length }
      record.links.set(parentKey, node)
    }
    head = node
  }
  const branch = { kind, head, length: values.length }
  branches.set(values, branch)
  return branch
}

export const materializeHistoryBranch = (branch: HistoryBranch): object[] => {
  const cached = materialized.get(branch) ?? (!branch.head ? emptyStreams.get(branch.kind) : undefined)
  if (cached) return cached
  const values: object[] = []
  let immutableRecords = true
  for (let node = branch.head; node; node = node.previous) {
    values.push(node.value)
    immutableRecords = immutableRecords && capturedRecords.has(node.value)
  }
  if (branch.kind !== 'log') values.reverse()
  branches.set(values, branch)
  Object.freeze(values)
  if (immutableRecords) capturedStreams.add(values)
  if (branch.head) materialized.set(branch, values)
  else emptyStreams.set(branch.kind, values)
  return values
}

export const registerRestoredHistoryNode = (node: HistoryNode): void => {
  freeze(node.value)
  // Restoration normally supplies JSON-parsed data. Keep externally supplied
  // shallow-frozen objects and accessors outside the immutable-record boundary.
  if (isDeeplyFrozenJsonData(node.value)) capturedRecords.add(node.value)
  const record = records.get(node.value) ?? { value: node.value, identity: node.identity, links: new Map<string, HistoryNode>() }
  record.links.set(`${node.kind}:${node.previous?.id ?? ''}`, node)
  records.set(node.value, record)
  registerHistoryRecordIdentity(node.value, node.identity)
}

/** Copy the small body; captured histories remain immutable, exact logical arrays. */
export const captureStateWithHistory = <T extends Pick<GameState, 'log' | 'events' | 'publicEventArchive' | 'players'>>(state: T, cloneBody: <V>(value: V) => V = copyJson): T => {
  const { log: _log, events: _events, publicEventArchive: _archive, ...body } = state
  const copied = cloneBody(body) as Record<string, unknown>
  // Preserve state key order too: failed-command snapshots are compared as JSON.
  return Object.fromEntries(Object.keys(state).flatMap(key => {
    if (historyStreamKeys.includes(key as HistoryStreamKind)) {
      const kind = key as HistoryStreamKind
      return [[kind, materializeHistoryBranch(historyBranch(state[kind], kind, state))]]
    }
    return Object.hasOwn(copied, key) ? [[key, copied[key]]] : []
  })) as T
}

const recoveryIdentities = new WeakMap<object, string>()
export const recoveryRecordId = (value: object): string => {
  let id = recoveryIdentities.get(value)
  if (!id) { id = identifier(); recoveryIdentities.set(value, id) }
  return id
}
export const registerRecoveryRecordId = (value: object, id: string): void => { recoveryIdentities.set(value, id) }
export const registerHistoryBranch = (values: readonly object[], branch: HistoryBranch): void => { branches.set(values, branch) }

/** A renamed raw parameter version retains the record's original operation and roles. */
export const copyHistoryRecordIdentity = <T extends object>(source: T, target: T): T => {
  const record = records.get(source)
  if (record) {
    const value = copyJson(target)
    freeze(value)
    capturedRecords.add(value)
    const version = { value, identity: record.identity, links: new Map<string, HistoryNode>() }
    records.set(target, version)
    records.set(value, version)
    registerHistoryRecordIdentity(target, version.identity)
    registerHistoryRecordIdentity(value, version.identity)
  }
  return target
}
