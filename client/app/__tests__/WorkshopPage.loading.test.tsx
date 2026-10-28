// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../../shared/i18n'
import type { AuthUser, useAuth } from '../../contexts/AuthContext'
import { LocaleContext } from '../../contexts/LocaleContext'
import { WorkshopPage } from '../WorkshopPage'

const { apiFetch, user } = vi.hoisted(() => ({
  apiFetch: vi.fn<ReturnType<typeof useAuth>['apiFetch']>(),
  user: { id: 'workshop-reader', username: 'reader', displayName: 'Reader' } satisfies AuthUser,
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user, apiFetch }) }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

type Section = 'browse' | 'featured' | 'mine' | 'sandbox'
function sectionFor(path: string): Section {
  const url = new URL(path, 'https://api.example')
  if (url.pathname === '/api/workshop/sandbox') return 'sandbox'
  if (url.searchParams.has('featured')) return 'featured'
  if (url.searchParams.has('scope')) return 'mine'
  return 'browse'
}

for (const section of ['browse', 'featured', 'mine', 'sandbox'] satisfies Section[]) {
  describe(`${section} Workshop loading`, () => {
    for (const failure of ['request', 'body']) {
      it(`shows a recoverable error when the ${failure} fails`, async () => {
        let rejectLoad = true
        let attempts = 0
        apiFetch.mockImplementation(async path => {
          const isTarget = sectionFor(path) === section
          if (isTarget) attempts++
          if (isTarget && rejectLoad) {
            if (failure === 'request') throw new TypeError('Load failed')
            return new Response(new ReadableStream({
              start(controller) { controller.error(new TypeError('Load failed')) },
            }))
          }
          return new Response(JSON.stringify({ ok: true, cards: [], settings: { player_count: 3 } }))
        })
        render(
          <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn(), t: (key, params) => t('en', key, params) }}>
            <WorkshopPage />
          </LocaleContext.Provider>,
        )
        expect((await screen.findByRole('alert')).textContent).toContain('Network error')
        rejectLoad = false
        fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }))
        await waitFor(() => {
          expect(screen.queryByRole('alert')).toBeNull()
          expect(attempts).toBe(2)
        })
        expect(await screen.findByText('3 Players', { exact: true })).toBeTruthy()
      })
    }
  })
}
