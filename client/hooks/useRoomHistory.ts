import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GameTransport } from '../services/gameTransport'
import type { ClientGameState } from '../services/rehydrate'
import type { HistoryWindow, RoomHistoryPage } from '../../shared/contract/protocol/history'
import { projectHistoryLogNames } from '../../shared/projections/history-names'

/** Loaded pages belong to one viewer and branch. A new branch immediately hides old pages. */
export const useRoomHistory = (transport: GameTransport, state: ClientGameState | null, window: HistoryWindow | undefined) => {
  const [cache, setCache] = useState<{ branch: string; pages: RoomHistoryPage[]; resetNotice: boolean }>({ branch: window?.branchId ?? '', pages: [], resetNotice: false })
  const [status, setStatus] = useState({ branch: '', loading: false, error: false })
  const branch = window?.branchId ?? ''
  const pendingRef = useRef<string | null>(null)
  const branchRef = useRef(branch)
  useLayoutEffect(() => { branchRef.current = branch }, [branch])
  if (cache.branch !== branch) setCache({ branch, pages: [], resetNotice: cache.pages.length > 0 })
  const pages = useMemo(() => cache.branch === branch ? cache.pages : [], [branch, cache])
  const loading = status.branch === branch && status.loading
  const error = status.branch === branch && status.error
  const nextCursor = pages.at(-1)?.window.nextCursor ?? (pages.length ? null : window?.nextCursor ?? null)
  const loadOlder = useCallback(async () => {
    if (!transport.getHistory || !nextCursor) return
    const requestKey = `${branch}:${nextCursor}`
    if (pendingRef.current === requestKey) return
    pendingRef.current = requestKey
    const acceptedBranch = branch
    setStatus({ branch, loading: true, error: false })
    try {
      const page = await transport.getHistory(nextCursor)
      if (branchRef.current !== acceptedBranch || page.window.branchId !== acceptedBranch) return
      setCache(current => current.branch === acceptedBranch
        ? { branch: acceptedBranch, resetNotice: false, pages: current.pages.some(existing => existing.window.operationGroupIds[0] === page.window.operationGroupIds[0]) ? current.pages : [...current.pages, page] } : current)
    } catch (error) {
      if (branchRef.current !== acceptedBranch) return
      if ((error as { code?: string }).code === 'history_branch_changed') {
        try {
          await transport.getState()
          setCache(current => ({ ...current, resetNotice: true }))
        } catch { setStatus({ branch, loading: false, error: true }) }
      } else setStatus({ branch, loading: false, error: true })
    } finally {
      if (pendingRef.current === requestKey) pendingRef.current = null
      if (branchRef.current === acceptedBranch) setStatus(current => ({ ...current, loading: false }))
    }
  }, [branch, nextCursor, transport])
  const streams = useMemo(() => {
    if (!state || !window || pages.length === 0) return { log: state?.log ?? [], events: state?.events ?? [], publicEventArchive: state?.publicEventArchive ?? [] }
    const names = Object.fromEntries(state.players.map(player => [player.id, player.name]))
    const log = [...state.log]
    const logIds = new Set(window.logRecords.map(record => record.recordId))
    for (const page of pages) page.log.forEach((entry, index) => {
      const metadata = page.window.logRecords[index]!
      if (!logIds.has(metadata.recordId)) {
        logIds.add(metadata.recordId)
        log.push(projectHistoryLogNames(entry, metadata.participantRoles, names))
      }
    })
    const events = [...[...pages].reverse().flatMap(page => page.events), ...state.events]
    const publicEventArchive = [...[...pages].reverse().flatMap(page => page.publicEventArchive), ...state.publicEventArchive]
    return { log, events, publicEventArchive }
  }, [pages, state, window])
  return { ...streams, loading, error, resetNotice: cache.resetNotice, loadOlder, canLoadOlder: !!nextCursor && !!transport.getHistory }
}
