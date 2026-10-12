import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { GameState } from '../contract/types'
import { projectHistoryLogNames, isHistoryParticipantNamePath } from '../projections/history-names'
import type { GameSyncPayload } from '../contract/protocol/game'
import type { HistoryDisplayRecord, HistoryProjectionAnchor, RoomHistoryPage } from '../contract/protocol/history'
import type { SerializedGameState } from './serialization'
import { filterSerializedStateForPlayer } from '../projections/serialized-state'
import { getHistoryRecordIdentity, historyBranch, historyStreamKeys, inheritHistoryRecordIdentity } from './history-streams'

export const HISTORY_WINDOW_GROUPS = 20
export class HistoryBranchChangedError extends Error {}
export class HistoryProjectionChangedError extends HistoryBranchChangedError {}
type HistorySource = Pick<GameState, 'log' | 'events' | 'publicEventArchive' | 'players'>
type HistoryDescription = { branchId: string; groups: string[] }
type HistoryValue = HistorySource['log'][number] | HistorySource['events'][number] | HistorySource['publicEventArchive'][number]
type StaticDisplayRecord = Omit<HistoryDisplayRecord, 'projectionHash'>
const displayRecords = new WeakMap<object, StaticDisplayRecord>()
const logDisplayRecords = new WeakMap<object, StaticDisplayRecord>()
const descriptions = new WeakMap<object, { events: object; archive: object; value: HistoryDescription }>()

/** Normalize identity-based log names during encoding, without a second display projection/copy. */
const projectionJson = (entry: HistoryValue, roles?: Record<string, string>): string => {
  if (!roles) return JSON.stringify(entry)
  const paths = new WeakMap<object, string>()
  return JSON.stringify(entry, function (this: Record<string, unknown>, key: string, value: unknown) {
    const parent = paths.get(this) ?? ''
    const path = key ? (parent ? `${parent}.${key}` : key) : ''
    if (value && typeof value === 'object') paths.set(value, path)
    return typeof value === 'string' && isHistoryParticipantNamePath(path) && roles[path] ? roles[path] : value
  })
}

export const describeHistory = (state: HistorySource): HistoryDescription => {
  const branches = historyStreamKeys.map(kind => historyBranch(state[kind], kind, state))
  const [log, events, archive] = branches
  const cached = descriptions.get(log!)
  if (cached?.events === events && cached.archive === archive) return cached.value
  const paths = branches.map(branch => branch.head?.continuationId ?? branch.head?.id ?? 'empty')
  // Cancellation is a presentation rebranch even though the archive itself appends.
  const canceled = [...state.publicEventArchive].reverse().find(packet => packet.type === 'publicEvents.canceled')
  const cancellationId = canceled ? getHistoryRecordIdentity(canceled)?.recordId ?? canceled.id : 'none'
  const groups = new Set<string>()
  for (const record of [...state.publicEventArchive, ...state.events, ...[...state.log].reverse()]) {
    const identity = getHistoryRecordIdentity(record)
    if (identity) groups.add(identity.operationGroupId)
  }
  const value = { branchId: [...paths, cancellationId].join('.'), groups: [...groups] }
  descriptions.set(log!, { events: events!, archive: archive!, value })
  return value
}


export const projectHistoryStateNames = (state: SerializedGameState): SerializedGameState => {
  const names = Object.fromEntries(state.players.map(player => [player.id, player.name]))
  return { ...state, log: state.log.map(entry => inheritHistoryRecordIdentity(entry, projectHistoryLogNames(entry, getHistoryRecordIdentity(entry)?.participantRoles, names))) }
}

export const historyPageFromFilteredState = (canonical: HistorySource, filtered: SerializedGameState, cursor?: string, viewerPlayerId: string | null = null): RoomHistoryPage => {
  const description = describeHistory(canonical)
  const branchId = `${description.branchId}.${viewerPlayerId ?? 'spectator'}`
  const groups = description.groups
  const visibleGroups = new Set<string>()
  for (const kind of historyStreamKeys) for (const entry of filtered[kind]) {
    const identity = getHistoryRecordIdentity(entry)
    if (identity) visibleGroups.add(identity.operationGroupId)
  }
  const ordered = groups.filter(group => visibleGroups.has(group))
  let end = ordered.length
  let parsed: { branchId?: string; beforeGroup?: string; heads?: Array<string | null>; projectionHeads?: Array<HistoryProjectionAnchor | null> } = {}
  if (cursor) {
    try { parsed = JSON.parse(cursor) as typeof parsed } catch { throw new Error('Invalid history cursor') }
    if (parsed.branchId !== branchId) throw new HistoryBranchChangedError('History changed; refresh the current window')
    if (!Array.isArray(parsed.heads) || parsed.heads.length !== historyStreamKeys.length) throw new Error('Invalid history anchors')
    historyStreamKeys.forEach((kind, index) => {
      const anchor = parsed.heads![index]
      if (anchor === null) return
      let node = historyBranch(canonical[kind], kind, canonical).head
      while (node && node.id !== anchor) node = node.previous
      if (!node) throw new HistoryBranchChangedError('History changed; refresh the current window')
    })
    end = ordered.indexOf(parsed.beforeGroup ?? '')
    if (end < 0) throw new Error('Invalid history group cursor')
  }
  const start = Math.max(0, end - HISTORY_WINDOW_GROUPS)
  const selected = ordered.slice(start, end)
  const selectedSet = new Set(selected)
  if (cursor && (!Array.isArray(parsed.projectionHeads) || parsed.projectionHeads.length !== historyStreamKeys.length)) throw new Error('Invalid history projection anchors')
  // Hash ONLY the already-filtered public projection, never hidden hands/counts
  // or raw event values. Ordinary appends preserve earlier prefix hashes. Names
  // are normalized because their client projection already updates cached logs.
  const hashes = historyStreamKeys.map((kind, streamIndex) => {
    const entries = kind === 'log' ? [...filtered.log].reverse() : filtered[kind]
    const hash = sha256.create()
    const result = new Map<string, string>()
    entries.forEach((entry, index) => {
      const identity = getHistoryRecordIdentity(entry)!
      const encoded = projectionJson(entry, kind === 'log' ? identity.participantRoles : undefined)
      hash.update(utf8ToBytes(`[${JSON.stringify(identity.recordId)},${encoded}]\n`))
      if (selectedSet.has(identity.operationGroupId) || index === entries.length - 1 || parsed?.projectionHeads?.[streamIndex]?.recordId === identity.recordId) {
        result.set(identity.recordId, bytesToHex(hash.clone().digest()))
      }
    })
    return result
  })
  parsed?.projectionHeads?.forEach((anchor, index) => {
    if (anchor === null) return
    if (!anchor || typeof anchor.recordId !== 'string' || typeof anchor.projectionHash !== 'string') throw new Error('Invalid history projection anchor')
    if (hashes[index]!.get(anchor.recordId) !== anchor.projectionHash) throw new HistoryProjectionChangedError('History projection changed; refresh the current window')
  })
  const projectionHeads = historyStreamKeys.map((kind, index) => {
    const entry = kind === 'log' ? filtered.log[0] : filtered[kind].at(-1)
    if (!entry) return null
    const recordId = getHistoryRecordIdentity(entry)!.recordId
    return { recordId, projectionHash: hashes[index]!.get(recordId)! }
  })
  const select = <T extends object>(entries: T[]): T[] => entries.filter(entry => selectedSet.has(getHistoryRecordIdentity(entry)?.operationGroupId ?? ''))
  const log = select(filtered.log)
  const events = select(filtered.events)
  const publicEventArchive = select(filtered.publicEventArchive)
  const metadata = (entry: HistorySource['log'][number] | HistorySource['events'][number] | HistorySource['publicEventArchive'][number], display = false): HistoryDisplayRecord => {
    const identity = getHistoryRecordIdentity(entry)!
    const cache = display ? logDisplayRecords : displayRecords
    let record = cache.get(identity)
    if (!record) {
      record = Object.freeze({ recordId: identity.recordId, operationGroupId: identity.operationGroupId,
        ...(display ? { participantRoles: Object.freeze(Object.fromEntries(Object.entries(identity.participantRoles).filter(([path]) => isHistoryParticipantNamePath(path)))) } : {}),
      })
      cache.set(identity, record)
    }
    const kind = display ? 'log' : 'type' in entry && (entry.type === 'publicEvents.committed' || entry.type === 'publicEvents.canceled') ? 'publicEventArchive' : 'events'
    return { ...record, projectionHash: hashes[historyStreamKeys.indexOf(kind)]!.get(identity.recordId)! }
  }
  return { log, events, publicEventArchive, window: {
    branchId, projectionHeads, streamLengths: historyStreamKeys.map(kind => filtered[kind].length), operationGroupIds: selected,
    nextCursor: start > 0 ? JSON.stringify({ branchId, beforeGroup: ordered[start], projectionHeads, heads: historyStreamKeys.map(kind => historyBranch(canonical[kind], kind, canonical).head?.id ?? null) }) : null,
    logRecords: log.map(entry => metadata(entry, true)), eventRecords: events.map(entry => metadata(entry)), archiveRecords: publicEventArchive.map(entry => metadata(entry)),
  } }
}

export const buildRoomHistoryPage = (canonical: SerializedGameState, viewerPlayerId: string | null, cursor?: string): RoomHistoryPage => {
  describeHistory(canonical)
  return historyPageFromFilteredState(canonical, projectHistoryStateNames(filterSerializedStateForPlayer(canonical, viewerPlayerId)), cursor, viewerPlayerId)
}
export const applyHistoryWindow = (canonical: HistorySource, payload: GameSyncPayload, viewerPlayerId: string | null): GameSyncPayload => {
  const page = historyPageFromFilteredState(canonical, payload.state, undefined, viewerPlayerId)
  return { ...payload, state: { ...payload.state, log: page.log, events: page.events, publicEventArchive: page.publicEventArchive }, historyWindow: page.window }
}
