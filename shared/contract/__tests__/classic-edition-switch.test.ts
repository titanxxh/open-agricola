import { expect, it } from 'vitest'
import { CLASSIC_EDITION_ENABLED } from '../card-edition'

// ADR 0049: main keeps classic games closed. Pre enables them with one commit that flips the constant and this
// expectation together; main asserts `false`, and this prerelease feature asserts `true`.
it('opens the classic edition switch on prerelease', () => {
  expect(CLASSIC_EDITION_ENABLED).toBe(true)
})
