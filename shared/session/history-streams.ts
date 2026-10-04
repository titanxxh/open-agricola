import type { GameState } from '../contract/types'

export const historyStreamKeys = ['log', 'events', 'publicEventArchive'] as const
export type HistoryStreamKind = typeof historyStreamKeys[number]
export type HistoryRecordIdentity = {
  recordId: string
  operationGroupId: string
  participantRoles: Record<string, string>
}
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
const identifier = (): string => crypto.randomUUID()
const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
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
      if (typeof child === 'string' && /(?:playerId|PlayerId)$/.test(key) && ids.has(child)) result[childPath] = child
      if (typeof child === 'string' && ['player', 'playerName', 'fromPlayer', 'toPlayer'].includes(key)) {
        const id = uniqueNames.get(child)
        if (id) result[childPath] = id
      }
      if (typeof child === 'object') visit(child, childPath)
    }
  }
  visit(value, '')
  const actor = (value as { playerId?: string }).playerId
  if (actor) result['params.player'] = actor
  return result
}

export const historyBranch = (values: readonly object[], kind: HistoryStreamKind, state: Pick<GameState, 'players'>): HistoryBranch => {
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
      record = { value, identity: { recordId: identifier(), operationGroupId: groups.get(state) ?? identifier(), participantRoles: roles(entry, state) }, links: new Map() }
      records.set(entry, record)
      records.set(value, record)
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
  const values: object[] = []
  for (let node = branch.head; node; node = node.previous) values.push(node.value)
  if (branch.kind !== 'log') values.reverse()
  branches.set(values, branch)
  Object.freeze(values)
  return values
}

export const registerRestoredHistoryNode = (node: HistoryNode): void => {
  freeze(node.value)
  const record = records.get(node.value) ?? { value: node.value, identity: node.identity, links: new Map<string, HistoryNode>() }
  record.links.set(`${node.kind}:${node.previous?.id ?? ''}`, node)
  records.set(node.value, record)
}

/** Copy the small body; captured histories remain immutable, exact logical arrays. */
export const captureStateWithHistory = <T extends Pick<GameState, 'log' | 'events' | 'publicEventArchive' | 'players'>>(state: T): T => {
  const { log: _log, events: _events, publicEventArchive: _archive, ...body } = state
  const copied = copyJson(body) as Record<string, unknown>
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
    const version = { value, identity: record.identity, links: new Map<string, HistoryNode>() }
    records.set(target, version)
    records.set(value, version)
  }
  return target
}
