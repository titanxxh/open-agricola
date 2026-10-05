export type ShutdownSignals = {
  on?(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
  once(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
}

export const installShutdownHandlers = (
  shutdown: () => void | Promise<void>,
  signals: ShutdownSignals = process,
): void => {
  let started = false
  const handle = (): void => {
    if (started) return
    started = true
    void Promise.resolve(shutdown()).catch(error => {
      console.error('[shutdown] failed', error)
      process.exitCode = 1
    })
  }
  const listen = signals.on?.bind(signals) ?? signals.once.bind(signals)
  listen('SIGTERM', handle)
  listen('SIGINT', handle)
}
