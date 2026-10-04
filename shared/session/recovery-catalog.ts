import type { GameState } from '../contract/types'
import type { PersistedSessionSnapshot } from './serialization'
import type { HistoryEntry, SessionCommandCheckpoint } from './session-core'
import { historyBranch, historyStreamKeys, recoveryRecordId, registerRecoveryRecordId, registerHistoryBranch, registerRestoredHistoryNode, type HistoryNode, type HistoryRecordIdentity, type HistoryStreamKind } from './history-streams'

type Path = Array<string | number>
export type RecoveryHistoryCatalog = {
  nodes: Array<{ id: string; kind: HistoryStreamKind; previousId: string | null; length: number; identity: HistoryRecordIdentity }>
  streams: Array<{ path: Path; kind: HistoryStreamKind; head: string | null; length: number }>
  recoveries: Array<{ path: Path; id: string }>
}

/** Worker IPC and JSON preserve the logical Frame; this sidecar preserves identities outside it. */
export const exportRecoveryCatalog = (snapshot: PersistedSessionSnapshot, preserveAliases = true): RecoveryHistoryCatalog => {
  const catalog: RecoveryHistoryCatalog = { nodes: [], streams: [], recoveries: [] }
  const nodes = new Set<string>()
  const arrays = new WeakSet<object>()
  const recoveries = new WeakSet<object>()
  const state = (value: Pick<GameState, 'log' | 'events' | 'publicEventArchive' | 'players'>, path: Path): void => {
    for (const kind of historyStreamKeys) {
      const values = value[kind]
      if (!Array.isArray(values) || (preserveAliases && arrays.has(values))) continue
      arrays.add(values)
      const branch = historyBranch(values, kind, value)
      catalog.streams.push({ path: [...path, kind], kind, head: branch.head?.id ?? null, length: branch.length })
      for (let node = branch.head; node && !nodes.has(node.id); node = node.previous) {
        nodes.add(node.id)
        catalog.nodes.push({ id: node.id, kind, previousId: node.previous?.id ?? null, length: node.length, identity: node.identity })
      }
    }
  }
  const undo = (entry: HistoryEntry, path: Path): void => {
    if (preserveAliases && recoveries.has(entry)) return
    recoveries.add(entry)
    catalog.recoveries.push({ path, id: recoveryRecordId(entry) })
    state(entry.state, [...path, 'state'])
  }
  const checkpoint = (entry: SessionCommandCheckpoint, path: Path): void => {
    if (preserveAliases && recoveries.has(entry)) return
    recoveries.add(entry)
    catalog.recoveries.push({ path, id: recoveryRecordId(entry) })
    state(entry.state, [...path, 'state'])
    entry.history.forEach((entry, index) => undo(entry, [...path, 'history', index]))
  }
  state(snapshot.state, ['state'])
  state(snapshot.frame, ['frame'])
  snapshot.sessionCursor.history?.forEach((entry, index) => undo(entry, ['sessionCursor', 'history', index]))
  snapshot.sessionCursor.provisionalContinuationScopes?.forEach((scope, index) => checkpoint(scope.checkpoint, ['sessionCursor', 'provisionalContinuationScopes', index, 'checkpoint']))
  return catalog
}

const imported = new WeakSet<PersistedSessionSnapshot>()
export const importRecoveryCatalog = (snapshot: PersistedSessionSnapshot): void => {
  const catalog = snapshot.historyCatalog
  if (!catalog || imported.has(snapshot)) return
  const at = (path: Path): unknown => path.reduce<unknown>((value, key) => (value as Record<string | number, unknown>)[key], snapshot)
  const rows = new Map(catalog.nodes.map(node => [node.id, node]))
  const nodes = new Map<string, HistoryNode>()
  for (const stream of catalog.streams) {
    const values = at(stream.path) as object[]
    if (!Array.isArray(values) || values.length !== stream.length) throw new Error('Invalid recovery history catalog')
    const chain: typeof catalog.nodes = []
    const seen = new Set<string>()
    for (let id = stream.head; id;) {
      if (seen.has(id)) throw new Error('Cyclic recovery history catalog')
      seen.add(id)
      const row = rows.get(id)
      if (!row || row.kind !== stream.kind) throw new Error('Missing recovery history identity')
      chain.push(row)
      id = row.previousId
    }
    if (chain.length !== values.length) throw new Error('Mismatched recovery history catalog')
    let previous: HistoryNode | null = null
    for (const [index, row] of chain.reverse().entries()) {
      const valueIndex = stream.kind === 'log' ? values.length - index - 1 : index
      let node = nodes.get(row.id)
      if (!node) {
        if (row.length !== index + 1) throw new Error('Mismatched recovery history position')
        node = { id: row.id, kind: row.kind, previous, length: row.length, identity: row.identity, value: values[valueIndex]! }
        nodes.set(row.id, node)
        registerRestoredHistoryNode(node)
      }
      values[valueIndex] = node.value
      previous = node
    }
    registerHistoryBranch(values, { kind: stream.kind, head: previous, length: values.length })
    Object.freeze(values)
  }
  catalog.recoveries.forEach(entry => registerRecoveryRecordId(at(entry.path) as object, entry.id))
  imported.add(snapshot)
}

export const snapshotForWorker = (snapshot: PersistedSessionSnapshot): PersistedSessionSnapshot => ({ ...snapshot, historyCatalog: exportRecoveryCatalog(snapshot) })
