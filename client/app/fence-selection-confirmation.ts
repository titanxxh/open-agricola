import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { CommandRejectedError, type GameTransport } from '../services/gameTransport'

type FenceSubmission = { requestKey: string; transport: GameTransport }

export const useFenceSelectionConfirmation = (
  requestKey: string | null,
  transport: GameTransport,
  onRejected: (error: string) => void,
) => {
  const activeRequest = useRef<string | null>(null)
  const inFlight = useRef<FenceSubmission | null>(null)
  const [submission, setSubmission] = useState<FenceSubmission | null>(null)

  useLayoutEffect(() => () => {
    activeRequest.current = null
    inFlight.current = null
  }, [transport])

  const syncRequest = useCallback((nextRequestKey: string | null, roomChanged: boolean) => {
    activeRequest.current = nextRequestKey
    if (!inFlight.current || roomChanged || inFlight.current.requestKey !== nextRequestKey) {
      inFlight.current = null
      setSubmission(null)
    }
  }, [])

  const submit = useCallback((...args: Parameters<GameTransport['commitSelection']>) => {
    if (requestKey === null || activeRequest.current !== requestKey || inFlight.current) return
    const attempt = { requestKey, transport }
    inFlight.current = attempt
    setSubmission(attempt)
    const settle = (error: string | null) => {
      if (inFlight.current !== attempt) return
      inFlight.current = null
      setSubmission(null)
      if (error !== null) onRejected(error)
    }
    void transport.commitSelection(...args).then(
      response => settle(response.ok ? null : response.error ?? 'UNKNOWN'),
      (error: unknown) => settle(error instanceof CommandRejectedError ? error.message : 'UNKNOWN'),
    )
  }, [onRejected, requestKey, transport])

  return {
    submit,
    syncRequest,
    submitting: submission !== null && submission.requestKey === requestKey && submission.transport === transport,
  }
}
