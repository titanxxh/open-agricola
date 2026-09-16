// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { SANDBOX_PLAYER_COUNTS, buildSandboxCardIds, normalizeSandboxSettings, readSandboxStartResponse } from '../WorkshopPage'

describe('WorkshopPage sandbox launch helpers', () => {
  it('offers sandbox player counts from 2 to 6', () => {
    expect(SANDBOX_PLAYER_COUNTS).toEqual([2, 3, 4, 5, 6])
  })

  it('keeps six-player and variant settings from the API', () => {
    expect(normalizeSandboxSettings({
      player_count: 6,
      deck_ids: ['A'],
      enable_through_the_seasons: true,
      enable_farmers_of_the_moor: true,
      allow_incomplete_farmers_of_the_moor_minor_deal: true,
      enable_snake_opening: true,
    })).toEqual({
      player_count: 6,
      deck_ids: ['A'],
      enable_through_the_seasons: true,
      enable_farmers_of_the_moor: true,
      allow_incomplete_farmers_of_the_moor_minor_deal: true,
      enable_snake_opening: true,
    })
  })

  it('treats a missing or non-boolean snake opening setting as disabled', () => {
    expect(normalizeSandboxSettings({ player_count: 2 }).enable_snake_opening).toBe(false)
    expect(normalizeSandboxSettings({ player_count: 2, enable_snake_opening: 'true' }).enable_snake_opening).toBe(false)
  })

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

  it('ignores non-string extras such as click events', () => {
    const cardIds = buildSandboxCardIds(
      [
        { id: 'existing-db-id' },
      ],
      { type: 'click' },
    )

    expect(cardIds).toEqual(['existing-db-id'])
  })

  it('turns non-JSON sandbox start failures into a readable error', async () => {
    const result = await readSandboxStartResponse(
      new Response('<html>bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      }),
      'Sandbox start failed (502 Bad Gateway)',
    )

    expect(result).toEqual({
      ok: false,
      error: 'Sandbox start failed (502 Bad Gateway)',
    })
  })

  it('preserves a localized non-JSON sandbox start failure', async () => {
    const result = await readSandboxStartResponse(
      new Response('<html>bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      }),
      '启动沙盒游戏失败：502 Bad Gateway',
    )

    expect(result).toEqual({
      ok: false,
      error: '启动沙盒游戏失败：502 Bad Gateway',
    })
  })
})
