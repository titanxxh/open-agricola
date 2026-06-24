// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../AuthContext'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('does not read or write the legacy localStorage auth token', async () => {
    const getItem = vi.spyOn(window.localStorage.__proto__, 'getItem')
    const setItem = vi.spyOn(window.localStorage.__proto__, 'setItem')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ ok: false }), { status: 401 })
      }
      return new Response(JSON.stringify({ ok: true }))
    }))

    render(<AuthProvider><div>child</div></AuthProvider>)

    await screen.findByText('child')
    expect(getItem).not.toHaveBeenCalledWith('open-agricola-token')
    expect(setItem).not.toHaveBeenCalledWith('open-agricola-token', expect.any(String))
  })
})
