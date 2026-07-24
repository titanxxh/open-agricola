export type ShutdownSignals = {
  once(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
}

export const installShutdownHandlers = (
  shutdown: () => void,
  signals: ShutdownSignals = process,
): void => {
  let started = false
  const handle = (): void => {
    if (started) return
    started = true
    shutdown()
  }
  signals.once('SIGTERM', handle)
  signals.once('SIGINT', handle)
}
