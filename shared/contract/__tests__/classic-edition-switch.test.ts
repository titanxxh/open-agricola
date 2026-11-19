import { expect, it } from 'vitest'
import { CLASSIC_EDITION_ENABLED } from '../card-edition'

// ADR 0049: main keeps classic games closed. Pre enables them with one commit that flips the constant and this
// expectation together; a change to either alone on main fails here.
it('keeps the classic edition switch off on main', () => {
  expect(CLASSIC_EDITION_ENABLED).toBe(false)
})
