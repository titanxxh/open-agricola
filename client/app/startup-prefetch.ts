import type { PlatformPage } from '../utils/platform-page-url'

export type StartupLoaders = {
  cardText: () => Promise<unknown>
  cardsManifest: () => Promise<unknown>
  screen: Partial<Record<PlatformPage, () => Promise<unknown>>>
}

const CARD_PAGES: ReadonlySet<PlatformPage> = new Set(['game', 'workshop', 'encyclopedia'])

export const showsCards = (page: PlatformPage): boolean => CARD_PAGES.has(page)

/**
 * A screen that shows cards waits for card text, card metadata and its own chunk, so they start at startup beside the
 * Core Language Pack. On a slow link the total bytes decide that wait, and holding them back until the core pack is in
 * only leaves the link half used while it downloads (measured on a room link: about 5 s slower).
 * Each loader keeps its own pending request, so the screen reuses these downloads; a failure is retried by the screen.
 */
export function prefetchCardScreen(page: PlatformPage, loaders: StartupLoaders): void {
  const quiet = (load: (() => Promise<unknown>) | undefined) => { void load?.().catch(() => {}) }
  quiet(loaders.cardText)
  quiet(loaders.cardsManifest)
  quiet(loaders.screen[page])
}

/** Runs a task once the first screen is painted and the main thread is idle, so it never competes with that screen. */
export function afterFirstRender(task: () => void, win: Pick<Window, 'setTimeout'> & Partial<Pick<Window, 'requestIdleCallback' | 'requestAnimationFrame'>> = window): void {
  const idle = () => {
    if (win.requestIdleCallback) win.requestIdleCallback(() => task(), { timeout: 2000 })
    else win.setTimeout(task, 200)
  }
  if (win.requestAnimationFrame) win.requestAnimationFrame(() => { win.setTimeout(idle, 0) })
  else win.setTimeout(idle, 0)
}
