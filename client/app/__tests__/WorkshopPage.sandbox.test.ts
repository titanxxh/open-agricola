// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { buildSandboxCardIds } from '../WorkshopPage'

describe('WorkshopPage sandbox launch helpers', () => {
  it('includes the newly saved card id when launching before React state refreshes', () => {
    const cardIds = buildSandboxCardIds(
      [
        { id: 'existing-db-id' },
      ],
      'new-db-id',
    )

    expect(cardIds).toEqual(['existing-db-id', 'new-db-id'])
  })

  it('deduplicates the newly saved card id if it is already present', () => {
    const cardIds = buildSandboxCardIds(
      [
        { id: 'existing-db-id' },
        { id: 'new-db-id' },
      ],
      'new-db-id',
    )

    expect(cardIds).toEqual(['existing-db-id', 'new-db-id'])
  })
})
