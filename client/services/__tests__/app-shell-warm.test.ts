import { describe, expect, it, vi } from 'vitest'
import { warmAppShell } from '../app-shell-warm'

type Fake = { state: string; postMessage: ReturnType<typeof vi.fn>; listeners: Array<() => void>; addEventListener: (type: string, fn: () => void) => void; removeEventListener: () => void }
const worker = (state: string): Fake => {
  const value: Fake = { state, postMessage: vi.fn(), listeners: [], addEventListener: (_type, fn) => { value.listeners.push(fn) }, removeEventListener: () => {} }
  return value
}
const entries = () => [
  { name: 'https://site.test/assets/App-abc.js' },
  { name: 'https://site.test/assets/App-abc.js' },
  { name: 'https://site.test/i18n/zh.0123456789abcdef.json' },
  { name: 'https://site.test/api/whats-new?x=1' },
  { name: 'https://assets.test/assets/bg.webp' },
]
const container = (registration: unknown) => ({ getRegistration: vi.fn(async () => registration) }) as unknown as ServiceWorkerContainer

describe('warming the Pages Worker after the first screen', () => {
  it('reports each finished same-origin file once to the active Worker', async () => {
    const active = worker('activated')
    await warmAppShell(container({ installing: null, waiting: null, active }), entries, 'https://site.test')
    expect(active.postMessage).toHaveBeenCalledWith({ type: 'open-agricola:app-shell-warm-v1', urls: [
      'https://site.test/assets/App-abc.js', 'https://site.test/i18n/zh.0123456789abcdef.json',
    ] })
  })

  it('prefers a waiting build, which serves this page on the next visit', async () => {
    const active = worker('activated'), waiting = worker('installed')
    await warmAppShell(container({ installing: null, waiting, active }), entries, 'https://site.test')
    expect(waiting.postMessage).toHaveBeenCalledOnce()
    expect(active.postMessage).not.toHaveBeenCalled()
  })

  it('waits for an installing build and falls back when it fails to install', async () => {
    const installing = worker('installing'), active = worker('activated')
    const pending = warmAppShell(container({ installing, waiting: null, active }), entries, 'https://site.test')
    await Promise.resolve()
    expect(installing.postMessage).not.toHaveBeenCalled()
    installing.state = 'redundant'; installing.listeners.forEach(listener => listener())
    await pending
    expect(installing.postMessage).not.toHaveBeenCalled()
    expect(active.postMessage).toHaveBeenCalledOnce()
  })

  it('does nothing without a registration', async () => {
    await expect(warmAppShell(container(undefined), entries, 'https://site.test')).resolves.toBeUndefined()
  })
})
