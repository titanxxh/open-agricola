import { useCallback, useEffect, useRef, useState } from 'react'
import { startRoomCreation, resumePendingRoomCreation, type CreatedRoom } from '../../services/room-creation'
import { CommandRejectedError, type RoomCreationOptions } from '../../services/gameTransport'
import { setPage } from '../../utils/platform-page-url'

type CreationState = { phase: 'idle' } | { phase: 'creating' } | { phase: 'failed'; error: Error }

export function useRoomCreation() {
  const [state, setState] = useState<CreationState>({ phase: 'idle' })
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const settle = useCallback((operation: Promise<CreatedRoom>) => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ phase: 'creating' })
    void operation.then(created => {
      if (mounted.current) setPage('game', { room: created.roomId })
    }, failure => {
      if (mounted.current) setState({ phase: 'failed', error: failure instanceof Error ? failure : new Error(String(failure)) })
    }).finally(() => { inFlight.current = false })
  }, [])
  useEffect(() => {
    mounted.current = true
    const pending = resumePendingRoomCreation()
    if (pending) settle(pending)
    return () => { mounted.current = false }
  }, [settle])
  return {
    state,
    creating: state.phase === 'creating',
    adjustment: state.phase === 'failed' && state.error instanceof CommandRejectedError ? state.error.creationAdjustment : undefined,
    create: (options: RoomCreationOptions) => { if (!inFlight.current) settle(startRoomCreation(options)) },
    clearError: () => setState({ phase: 'idle' }),
  }
}
