import { describe, expect, it } from 'vitest'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { collectBuiltSpecialStables } from '../card-effects'
import '../B/B85_FarmHand'

const CARD_ID = 'B85_FarmHand'
const FARM_HAND_TILE: FarmTilePosition = { row: 0, col: 2 }

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    cardStates: {},
    ...overrides,
  }) as PlayerState

describe('collectBuiltSpecialStables', () => {
  it('returns the B85 FarmHand built position tagged with its source card', () => {
    const player = makePlayer({
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { flagged: true, extraData: { position: FARM_HAND_TILE } },
      },
    })
    expect(collectBuiltSpecialStables(player)).toEqual([
      { position: FARM_HAND_TILE, sourceCardId: CARD_ID },
    ])
  })

  it('returns empty when B85 is owned but the FarmHand stable is not yet built', () => {
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    expect(collectBuiltSpecialStables(player)).toEqual([])
  })

  it('returns empty after the FarmHand stable has been returned (position cleared)', () => {
    const player = makePlayer({
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { flagged: true, extraData: {} } },
    })
    expect(collectBuiltSpecialStables(player)).toEqual([])
  })

  it('returns empty for a player without any special-stable card', () => {
    expect(collectBuiltSpecialStables(makePlayer())).toEqual([])
  })
})
