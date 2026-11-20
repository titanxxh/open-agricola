// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/open-agricola/"}
import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const componentStyles = readFileSync('client/styles/components.css', 'utf8')

vi.mock('../LobbyPage', () => ({ LobbyPage: () => <main>Lobby page</main> }))
vi.mock('../CardMetadataBoundary', () => ({ CardMetadataBoundary: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../sandbox', () => ({ SandboxAppLazy: () => { throw new Error('Formal Workshop authoring must not mount on prerelease') } }))

afterEach(() => {
  cleanup(); vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/open-agricola/')
  window.localStorage.clear()
})

async function renderPrereleaseRouter() {
  const build = 'a'.repeat(40), generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease'); vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const { registerLanguagePack } = await import('../../../shared/i18n')
  registerLanguagePack({ version: 1, locale: 'zh', messages: {
    'platform.mainNavigation': 'Main navigation',
    'platform.tabLobby': 'Lobby', 'platform.tabWorkshop': 'Workshop',
    'platform.tabEncyclopedia': 'Encyclopedia', 'platform.tabSettings': 'Settings',
    'platform.backToLobbyPlain': 'Back to lobby',
    'prerelease.returnToProduction': 'Return to production',
    'prerelease.readonlyError': 'Workshop is read-only',
  } })
  const fetched = vi.fn<typeof fetch>(async input => {
    const path = new URL(String(input), window.location.origin).pathname
    if (path === '/api/prerelease/runtime') return Response.json({ ok: true, channel: 'prerelease', buildId: build, generationId: generation,
      appOrigin: window.location.origin, formalAppOrigin: 'https://formal.agricola.test', formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main' })
    expect(path).toBe('/api/auth/me')
    return Response.json({ ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
      prerelease: { buildId: build, generationId: generation, expiresAt: 9_000_000_000_000, validUntil: Date.now() + 30_000, serverTime: Date.now() } })
  })
  vi.stubGlobal('fetch', fetched)
  const { LocaleProvider } = await import('../../contexts/LocaleContext')
  const { AuthProvider } = await import('../../contexts/AuthContext')
  const { PrereleaseBoundary } = await import('../PrereleaseBoundary')
  const { PageRouter } = await import('../PageRouter')
  render(<LocaleProvider><PrereleaseBoundary><AuthProvider><PageRouter /></AuthProvider></PrereleaseBoundary></LocaleProvider>)
  return fetched
}

it.each([
  { tab: 'Settings', message: 'Return to production' },
  { tab: 'Workshop', message: 'Workshop is read-only' },
])('returns from the restricted $tab route through the real navigation', async ({ tab, message }) => {
  await renderPrereleaseRouter()
  expect(await screen.findByText('Lobby page')).toBeVisible()

  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: tab }))

  expect(screen.getByRole('main')).toHaveTextContent(message)
  expect(screen.queryByText('Lobby page')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(navigation).getByRole('button', { name: tab })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(within(navigation).getByRole('button', { name: 'Lobby' }))
  expect(await screen.findByText('Lobby page')).toBeVisible()
  expect(window.location.search).toBe('')
})

it.each([
  { page: 'settings', message: 'Return to production' },
  { page: 'workshop', message: 'Workshop is read-only' },
])('keeps a visible Lobby link on $page when the real stylesheet hides mobile navigation', async ({ page, message }) => {
  window.history.replaceState(null, '', `/open-agricola/?page=${page}`)
  const style = document.createElement('style')
  style.textContent = componentStyles
  document.head.append(style)
  try {
    await renderPrereleaseRouter()
    await waitFor(() => { expect(screen.getByRole('main')).toHaveTextContent(message) })
    expect(window.innerWidth).toBeGreaterThan(640)
    expect(document.querySelector('.mobile-tab-bar')).not.toBeVisible()

    const main = screen.getByRole('main')
    const lobby = within(main).getByRole('link', { name: 'Open Agricola: Back to lobby' })
    expect(lobby).toBeVisible()
    expect(lobby).toHaveAttribute('href', '/open-agricola/')
    expect(lobby.closest('.mobile-tab-bar')).toBeNull()
    expect(within(main).queryByRole('textbox')).toBeNull()
    expect(main.querySelector('form')).toBeNull()
  } finally { style.remove() }
})
