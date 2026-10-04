import type { GameState } from '../contract/types'
import { projectHistoryLogNames, isHistoryParticipantNamePath } from '../projections/history-names'
import type { GameSyncPayload } from '../contract/protocol/game'
import type { HistoryDisplayRecord, RoomHistoryPage } from '../contract/protocol/history'
import type { SerializedGameState } from './serialization'
import { filterSerializedStateForPlayer } from '../projections/serialized-state'
import { getHistoryRecordIdentity, historyBranch, historyStreamKeys, inheritHistoryRecordIdentity } from './history-streams'

export const HISTORY_WINDOW_GROUPS = 20
export class HistoryBranchChangedError extends Error {}
type HistorySource = Pick<GameState, 'log' | 'events' | 'publicEventArchive' | 'players'>
type HistoryDescription = { branchId: string; groups: string[] }
const displayRecords = new WeakMap<object, HistoryDisplayRecord>()
const logDisplayRecords = new WeakMap<object, HistoryDisplayRecord>()
const descriptions = new WeakMap<object, { events: object; archive: object; value: HistoryDescription }>()

export const describeHistory = (state: HistorySource): HistoryDescription => {
  const branches = historyStreamKeys.map(kind => historyBranch(state[kind], kind, state))
  const [log, events, archive] = branches
  const cached = descriptions.get(log!)
  if (cached?.events === events && cached.archive === archive) return cached.value
  const heads = branches.map(branch => branch.head?.id ?? 'empty')
  const groups = new Set<string>()
  for (const record of [...state.publicEventArchive, ...state.events, ...[...state.log].reverse()]) {
    const identity = getHistoryRecordIdentity(record)
    if (identity) groups.add(identity.operationGroupId)
  }
  const value = { branchId: heads.join('.'), groups: [...groups] }
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
  if (cursor) {
    let parsed: { branchId?: string; beforeGroup?: string }
    try { parsed = JSON.parse(cursor) as typeof parsed } catch { throw new Error('Invalid history cursor') }
    if (parsed.branchId !== branchId) throw new HistoryBranchChangedError('History changed; refresh the current window')
    end = ordered.indexOf(parsed.beforeGroup ?? '')
    if (end < 0) throw new Error('Invalid history group cursor')
  }
  const start = Math.max(0, end - HISTORY_WINDOW_GROUPS)
  const selected = ordered.slice(start, end)
  const selectedSet = new Set(selected)
  const select = <T extends object>(entries: T[]): T[] => entries.filter(entry => selectedSet.has(getHistoryRecordIdentity(entry)?.operationGroupId ?? ''))
  const log = select(filtered.log)
  const events = select(filtered.events)
  const publicEventArchive = select(filtered.publicEventArchive)
  const metadata = (entry: object, display = false): HistoryDisplayRecord => {
    const identity = getHistoryRecordIdentity(entry)!
    const cache = display ? logDisplayRecords : displayRecords
    let record = cache.get(identity)
    if (!record) {
      record = Object.freeze({ recordId: identity.recordId, operationGroupId: identity.operationGroupId,
        ...(display ? { participantRoles: Object.freeze(Object.fromEntries(Object.entries(identity.participantRoles).filter(([path]) => isHistoryParticipantNamePath(path)))) } : {}),
      })
      cache.set(identity, record)
    }
    return record
  }
  return { log, events, publicEventArchive, window: {
    branchId, operationGroupIds: selected, nextCursor: start > 0 ? JSON.stringify({ branchId, beforeGroup: ordered[start] }) : null,
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
