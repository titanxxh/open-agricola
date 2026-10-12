import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GameTransport } from '../services/gameTransport'
import type { ClientGameState } from '../services/rehydrate'
import type { HistoryDisplayRecord, HistoryWindow, RoomHistoryPage } from '../../shared/contract/protocol/history'
import { projectHistoryLogNames } from '../../shared/projections/history-names'

const rewound = (previous: HistoryWindow | undefined, current: HistoryWindow | undefined): boolean =>
  !!previous?.streamLengths?.some((length, index) => length > (current?.streamLengths?.[index] ?? length))

const pageFromSnapshot = (state: ClientGameState | null, window: HistoryWindow | undefined): RoomHistoryPage | null =>
  state && window ? { log: state.log, events: state.events, publicEventArchive: state.publicEventArchive, window } : null

/** Retain only complete groups that just left the live window, not overlapping snapshots. */
const droppedPage = (previous: RoomHistoryPage | null, current: HistoryWindow | undefined): RoomHistoryPage | null => {
  if (!previous || !current) return null
  const visible = new Set(current.operationGroupIds)
  const dropped = new Set(previous.window.operationGroupIds.filter(id => !visible.has(id)))
  if (!dropped.size) return null
  const select = <T,>(entries: T[], records: HistoryDisplayRecord[]) => {
    const indices = records.flatMap((record, index) => dropped.has(record.operationGroupId) ? [index] : [])
    return { entries: indices.map(index => entries[index]!), records: indices.map(index => records[index]!) }
  }
  const log = select(previous.log, previous.window.logRecords)
  const events = select(previous.events, previous.window.eventRecords)
  const archive = select(previous.publicEventArchive, previous.window.archiveRecords)
  return { log: log.entries, events: events.entries, publicEventArchive: archive.entries, window: {
    ...previous.window, operationGroupIds: [...dropped],
    logRecords: log.records, eventRecords: events.records, archiveRecords: archive.records,
  } }
}

type HistoryGap = { cursor: string; until: Set<string> }
type HistoryRefresh = { token: object; cursor: string; until: string | null; pages: RoomHistoryPage[] }
type HistoryCache = { branch: string; pages: RoomHistoryPage[]; live: RoomHistoryPage | null; reading: boolean; resetNotice: boolean; gap: HistoryGap | null; refresh: HistoryRefresh | null; refreshRequested: boolean }

const projectionChanged = (previous: HistoryWindow | undefined, current: HistoryWindow | undefined): boolean => {
  if (!previous || !current) return false
  return (['logRecords', 'eventRecords', 'archiveRecords'] as const).some(kind => {
    const hashes = new Map(previous[kind].map(record => [record.recordId, record.projectionHash]))
    return current[kind].some(record => hashes.has(record.recordId) && hashes.get(record.recordId) !== record.projectionHash)
  })
}
const refreshRange = (cache: HistoryCache, window: HistoryWindow | undefined): HistoryRefresh | null => {
  if (!window?.nextCursor) return null
  const oldest = cache.pages.at(-1)
  return { token: {}, cursor: window.nextCursor, pages: [],
    until: oldest?.window.nextCursor ? oldest.window.operationGroupIds[0]! : null }
}

const insertOlderPage = (pages: RoomHistoryPage[], page: RoomHistoryPage, beforeGroup: string): RoomHistoryPage[] => {
  const after = pages.findIndex(candidate => candidate.window.operationGroupIds.includes(beforeGroup)) + 1
  return [...pages.slice(0, after), page, ...pages.slice(after)]
}

/** Append-only paths retain loaded pages; a fork or viewer switch invalidates them immediately. */
export const useRoomHistory = (transport: GameTransport, state: ClientGameState | null, window: HistoryWindow | undefined) => {
  const branch = window?.branchId ?? ''
  const live = pageFromSnapshot(state, window)
  const [cache, setCache] = useState<HistoryCache>(
    { branch, pages: [], live, reading: false, resetNotice: false, gap: null, refresh: null, refreshRequested: false },
  )
  const [status, setStatus] = useState({ branch: '', loading: false, error: false })
  const refreshToken = cache.refresh?.token
  const scopeRef = useRef({ branch, transport, window, refreshToken })
  const pendingRef = useRef<{ scope: typeof scopeRef.current; key: string } | null>(null)
  useLayoutEffect(() => {
    if (scopeRef.current.branch !== branch || scopeRef.current.transport !== transport || scopeRef.current.refreshToken !== refreshToken || rewound(scopeRef.current.window, window) || projectionChanged(scopeRef.current.window, window)) {
      scopeRef.current = { branch, transport, window, refreshToken }
      pendingRef.current = null
      setStatus({ branch, loading: false, error: false })
    } else scopeRef.current.window = window
  }, [branch, transport, window, refreshToken])
  if (cache.branch !== branch || rewound(cache.live?.window, window)) {
    setCache({ branch, pages: [], live, reading: false, resetNotice: cache.reading, gap: null, refresh: null, refreshRequested: false })
  } else if (cache.live?.window !== window || (window && cache.live?.log !== state?.log)) {
    if (cache.reading && (cache.refreshRequested || projectionChanged(cache.live?.window, window))) {
      const dropped = droppedPage(cache.live, window)
      const pages = dropped ? [dropped, ...cache.pages] : cache.pages
      const refresh = refreshRange({ ...cache, pages }, window)
      setCache({ ...cache, live, refresh, refreshRequested: false, gap: null, pages: refresh ? pages : [] })
    } else {
      const dropped = cache.reading ? droppedPage(cache.live, window) : null
      // Reconnect can skip more than one window. Retain the reading range but
      // expose a gap cursor until paging reaches that original range again.
      const gap = cache.reading && cache.live && window?.nextCursor &&
        !cache.live.window.operationGroupIds.some(id => window.operationGroupIds.includes(id))
        ? { cursor: window.nextCursor, until: cache.gap?.until ?? new Set(cache.live.window.operationGroupIds) } : cache.gap
      setCache({ ...cache, live, gap, pages: dropped ? [dropped, ...cache.pages] : cache.pages,
        refresh: cache.refresh && dropped ? { ...cache.refresh, pages: [dropped, ...cache.refresh.pages] } : cache.refresh })
    }
  }
  const pages = useMemo(() => cache.branch === branch ? cache.pages : [], [cache.branch, cache.pages, branch])
  const loading = status.branch === branch && status.loading
  const error = status.branch === branch && status.error
  const nextCursor = cache.refresh?.cursor ?? cache.gap?.cursor ?? pages.at(-1)?.window.nextCursor ?? (pages.length ? null : window?.nextCursor ?? null)
  const loadOlder = useCallback(async () => {
    if (!transport.getHistory || !nextCursor) return
    const scope = scopeRef.current
    const requestedWindow = scope.window
    const key = `${branch}:${nextCursor}`
    if (pendingRef.current?.scope === scope && pendingRef.current.key === key) return
    const pending = { scope, key }
    pendingRef.current = pending
    setCache(current => ({ ...current, reading: true }))
    setStatus({ branch, loading: true, error: false })
    try {
      const { beforeGroup } = JSON.parse(nextCursor) as { beforeGroup?: unknown }
      if (typeof beforeGroup !== 'string') throw new Error('Invalid history cursor')
      const page = await transport.getHistory(nextCursor)
      if (scopeRef.current !== scope || page.window.branchId !== branch) return
      setCache(current => {
        if (current.branch !== branch) return current
        if (current.refresh?.cursor === nextCursor) {
          const pages = [...current.refresh.pages, page]
          const done = !page.window.nextCursor || (current.refresh.until && page.window.operationGroupIds.includes(current.refresh.until))
          return done ? { ...current, pages, refresh: null, gap: null, resetNotice: false }
            : { ...current, refresh: { ...current.refresh, pages, cursor: page.window.nextCursor! } }
        }
        // A reconnect may have no overlapping live record to compare. The gap
        // page provides the first common prefix anchor with the loaded range.
        if (current.pages.some(older => projectionChanged(older.window, page.window))) {
          return { ...current, refresh: refreshRange(current, current.live?.window), gap: null }
        }
        const gap = current.gap?.cursor === nextCursor
          ? page.window.operationGroupIds.some(id => current.gap!.until.has(id)) || !page.window.nextCursor
            ? null : { ...current.gap, cursor: page.window.nextCursor }
          : current.gap
        return { ...current, gap, resetNotice: false, pages: insertOlderPage(current.pages, page, beforeGroup) }
      })
    } catch (error) {
      if (scopeRef.current !== scope) return
      if ((error as { code?: string }).code === 'history_projection_changed') {
        try {
          await transport.getState()
          if (scopeRef.current === scope) setCache(current => current.live?.window !== requestedWindow
            ? { ...current, refresh: refreshRange(current, current.live?.window), gap: null }
            : { ...current, refreshRequested: true })
        } catch { if (scopeRef.current === scope) setStatus({ branch, loading: false, error: true }) }
      } else if ((error as { code?: string }).code === 'history_branch_changed') {
        try {
          await transport.getState()
          if (scopeRef.current === scope) setCache(current => ({ ...current, pages: [], gap: null, refresh: null, refreshRequested: false, resetNotice: true }))
        } catch { if (scopeRef.current === scope) setStatus({ branch, loading: false, error: true }) }
      } else setStatus({ branch, loading: false, error: true })
    } finally {
      if (pendingRef.current === pending) pendingRef.current = null
      if (scopeRef.current === scope) setStatus(current => ({ ...current, loading: false }))
    }
  }, [branch, nextCursor, transport])
  useEffect(() => {
    if (!cache.refresh || loading || error) return
    // Dispatch remote work after commit; a newer render can cancel it first.
    let canceled = false
    const scope = scopeRef.current
    queueMicrotask(() => { if (!canceled && scopeRef.current === scope) void loadOlder() })
    return () => { canceled = true }
  }, [cache.refresh, loading, error, loadOlder])
  const streams = useMemo(() => {
    if (!state || !window || !pages.length) return { log: state?.log ?? [], events: state?.events ?? [], publicEventArchive: state?.publicEventArchive ?? [] }
    const current = pageFromSnapshot(state, window)!
    const names = Object.fromEntries(state.players.map(player => [player.id, player.name]))
    const log = new Map<string, ClientGameState['log'][number]>()
    for (const page of [current, ...pages]) page.log.forEach((entry, index) => {
      const metadata = page.window.logRecords[index]!
      if (!log.has(metadata.recordId)) log.set(metadata.recordId, projectHistoryLogNames(entry, metadata.participantRoles, names))
    })
    const events = new Map<string, ClientGameState['events'][number]>()
    const archive = new Map<string, ClientGameState['publicEventArchive'][number]>()
    const appendOlder = <T,>(target: Map<string, T>, entries: T[], records: HistoryDisplayRecord[]) => {
      for (let index = entries.length - 1; index >= 0; index--) {
        const id = records[index]!.recordId
        if (!target.has(id)) target.set(id, entries[index]!)
      }
    }
    for (const page of [current, ...pages]) {
      appendOlder(events, page.events, page.window.eventRecords)
      appendOlder(archive, page.publicEventArchive, page.window.archiveRecords)
    }
    return { log: [...log.values()], events: [...events.values()].reverse(), publicEventArchive: [...archive.values()].reverse() }
  }, [pages, state, window])
  return { ...streams, loading, error, resetNotice: cache.resetNotice, loadOlder, canLoadOlder: !!nextCursor && !!transport.getHistory }
}
