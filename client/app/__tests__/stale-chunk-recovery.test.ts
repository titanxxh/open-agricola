import { afterEach, describe, expect, it, vi } from 'vitest'
import { installStaleChunkRecovery } from '../stale-chunk-recovery'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('stale chunk recovery', () => {
  it('reloads once and lets a repeated preload error reach the error boundary', () => {
    let listener: EventListener | undefined
    const values = new Map<string, string>()
    const reload = vi.fn()
    vi.spyOn(Date, 'now').mockReturnValue(100_000)
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, next: EventListener) => {
        if (type === 'vite:preloadError') listener = next
      }),
      location: { reload },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })

    installStaleChunkRecovery()

    const first = new Event('vite:preloadError', { cancelable: true })
    listener?.(first)
    expect(first.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    const second = new Event('vite:preloadError', { cancelable: true })
    listener?.(second)
    expect(second.defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
