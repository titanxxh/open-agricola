import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest doesn't expose `globals` by default, so @testing-library/react's
// auto-cleanup (which checks `typeof afterEach === 'function'` at module load)
// doesn't register itself. Wire it up explicitly here.
afterEach(() => {
  cleanup()
})
