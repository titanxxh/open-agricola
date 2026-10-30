import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('rejects an already cancelled run before requesting a cold runtime', async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', fetch)
  const { runBrowserCardTests } = await import('../card-tests.ts')
  await expect(runBrowserCardTests({ source: '', tests: '', signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetch).not.toHaveBeenCalled()
})

it('cancels while the shared runtime fetch is still pending', async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', fetch)
  const { runBrowserCardTests } = await import('../card-tests.ts')
  const controller = new AbortController()
  const run = runBrowserCardTests({ source: '', tests: '', signal: controller.signal })
  const cancelled = expect(run).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await cancelled
  expect(fetch).toHaveBeenCalledOnce()
})
