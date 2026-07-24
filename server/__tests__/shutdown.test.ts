import { describe, expect, it, vi } from 'vitest'
import { installShutdownHandlers, type ShutdownSignals } from '../shutdown.ts'

describe('installShutdownHandlers', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('runs shutdown once for %s', (signal) => {
    const listeners = new Map<string, () => void>()
    const signals: ShutdownSignals = {
      once: vi.fn((name, listener) => {
        listeners.set(name, listener)
      }),
    }
    const shutdown = vi.fn()
    installShutdownHandlers(shutdown, signals)

    listeners.get(signal)?.()
    listeners.get(signal)?.()

    expect(shutdown).toHaveBeenCalledOnce()
    expect(listeners.keys()).toContain('SIGTERM')
    expect(listeners.keys()).toContain('SIGINT')
  })
})
