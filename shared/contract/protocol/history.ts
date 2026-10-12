import type { GameState } from '../types'

export type HistoryDisplayRecord = {
  recordId: string
  operationGroupId: string
  /** SHA-256 of the viewer-visible prefix through this record (names normalized). */
  projectionHash: string
  participantRoles?: Record<string, string>
}
export type HistoryProjectionAnchor = { recordId: string; projectionHash: string }
export type HistoryWindow = {
  branchId: string
  /** Last visible record/prefix in each full stream, also carried by page cursors. */
  projectionHeads: Array<HistoryProjectionAnchor | null>
  /** Full stream lengths distinguish a restored prefix from an ordinary append. */
  streamLengths?: number[]
  operationGroupIds: string[]
  nextCursor: string | null
  logRecords: HistoryDisplayRecord[]
  eventRecords: HistoryDisplayRecord[]
  archiveRecords: HistoryDisplayRecord[]
}
export type RoomHistoryPage = Pick<GameState, 'log' | 'events' | 'publicEventArchive'> & { window: HistoryWindow }
