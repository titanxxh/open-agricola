import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest doesn't expose `globals` by default, so @testing-library/react's
// auto-cleanup (which checks `typeof afterEach === 'function'` at module load)
// doesn't register itself. Wire it up explicitly here.
afterEach(() => {
  cleanup()
})

// jsdom does not implement `window.matchMedia`. Components that branch on
// viewport size (e.g. PlayerTabs collapsing into a SelectButton on mobile)
// rely on it; provide a desktop-default stub so those components render in
// their non-mobile form during tests.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
