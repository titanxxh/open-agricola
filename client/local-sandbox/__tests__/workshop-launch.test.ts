import { describe, expect, it } from 'vitest'
import { LOCAL_SANDBOX_STATUS, buildLocalGameConfig, parseLocalSandboxStatus, pinnedVersionToLocalCard } from '../workshop-launch.ts'

const settings = {
  player_count: 3, deck_ids: ['A'], enable_through_the_seasons: false, enable_farmers_of_the_moor: false,
  allow_incomplete_farmers_of_the_moor_minor_deal: false, enable_snake_opening: true,
}

describe('Workshop browser sandbox launch', () => {
  it('turns a pinned version snapshot into its exact sandbox card', () => {
    expect(pinnedVersionToLocalCard({ id: 'CUSTOM_B', card_type: 'minor', name: 'B', _code: 'source B', _compiled: 'compiled' }, '/art.png')).toEqual({
      cardType: 'minor', cardJson: { id: 'CUSTOM_B', card_type: 'minor', name: 'B' }, source: 'source B', artUrl: '/art.png',
    })
  })

  it.each([
    [{ id: 'CUSTOM_B', _code: 'source B' }, 'Pinned version has no card type'],
    [{ id: 'CUSTOM_B', card_type: 'occupation', _code: '  ' }, 'Pinned version has no source'],
  ])('rejects an incomplete pinned snapshot %j', (cardJson, error) => {
    expect(() => pinnedVersionToLocalCard(cardJson, null)).toThrow(error)
  })

  it('carries the launch identity and seed into the stashed config', () => {
    const config = buildLocalGameConfig([], settings, { instanceId: 'launch-1', seed: 7 })
    expect(config).toMatchObject({ instanceId: 'launch-1', seed: 7, cards: [], playerCount: 3, deckIds: ['A'], enableSnakeOpening: true })
  })

  it('accepts only well-formed status messages', () => {
    // A resumed save keeps its own game identity under the current launch.
    expect(parseLocalSandboxStatus({ type: LOCAL_SANDBOX_STATUS, kind: 'running', launchId: 'l', instanceId: 'a', cardWarnings: ['w'] }))
      .toEqual({ type: LOCAL_SANDBOX_STATUS, kind: 'running', launchId: 'l', instanceId: 'a', cardWarnings: ['w'] })
    expect(parseLocalSandboxStatus({ type: LOCAL_SANDBOX_STATUS, kind: 'failed', launchId: 'l', instanceId: '', error: 'boom' }))
      .toEqual({ type: LOCAL_SANDBOX_STATUS, kind: 'failed', launchId: 'l', instanceId: '', error: 'boom' })
    for (const value of [
      null, 'text', { type: 'other', kind: 'running', launchId: 'l', instanceId: 'a', cardWarnings: [] },
      { type: LOCAL_SANDBOX_STATUS, kind: 'running', launchId: 'l', cardWarnings: [] },
      { type: LOCAL_SANDBOX_STATUS, kind: 'running', instanceId: 'a', cardWarnings: [] },
      { type: LOCAL_SANDBOX_STATUS, kind: 'running', launchId: 'l', instanceId: 'a', cardWarnings: [1] },
      { type: LOCAL_SANDBOX_STATUS, kind: 'failed', launchId: 'l', instanceId: 'a' },
    ]) expect(parseLocalSandboxStatus(value)).toBeNull()
  })
})
