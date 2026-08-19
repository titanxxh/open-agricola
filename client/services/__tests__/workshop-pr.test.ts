// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('workshop PR OAuth popup', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('opens relative OAuth start URLs against the configured API base', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://your-game.duckdns.org')
    const open = vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
    } as unknown as Window)
    const { openOAuthPopupAndWait } = await import('../workshop-pr')

    const resultPromise = openOAuthPopupAndWait('/api/workshop/github/oauth/start?hs=abc', 'abc')

    expect(open).toHaveBeenCalledWith(
      'https://your-game.duckdns.org/api/workshop/github/oauth/start?hs=abc',
      'workshop-pr-oauth',
      'width=600,height=700',
    )

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://your-game.duckdns.org',
      data: { type: 'workshop-pr-oauth', result: { ok: true, hs: 'abc' } },
    }))
    await expect(resultPromise).resolves.toEqual({ ok: true, error: undefined })
  })
})
