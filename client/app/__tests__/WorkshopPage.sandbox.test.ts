// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { buildSandboxCardIds, readSandboxStartResponse } from '../WorkshopPage'

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

  it('turns non-JSON sandbox start failures into a readable error', async () => {
    const result = await readSandboxStartResponse(
      new Response('<html>bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      }),
      'Unknown sandbox error',
    )

    expect(result).toEqual({
      ok: false,
      error: 'Sandbox start failed (502 Bad Gateway)',
    })
  })
})
