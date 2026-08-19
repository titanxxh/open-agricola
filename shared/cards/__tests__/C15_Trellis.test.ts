import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners } from '../card-listeners'

import '../C/C015_Trellis'

describe('C015_Trellis listener phase', () => {
  it('listens on `before` phase (reference onPlayerPlaceFarmer fires before action)', () => {
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'C15-trellis-before-place-farmer',
    )
    expect(listener).toBeDefined()
    // The reference `onPlayerPlaceFarmer` is the before-event; `onPlayerAfterPlaceFarmer`
    // would be after. Desc reads "Each time before you use the Pig Market...",
    // so this listener should fire on `before`, not `after`.
    expect(listener!.phases).toContain('before')
    expect(listener!.phases).not.toContain('after')
  })
})
