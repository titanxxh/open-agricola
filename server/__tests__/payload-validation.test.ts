import { describe, expect, it } from 'vitest'
import {
  validateMultiTilePayload,
  validateResourcePayload,
  validateSingleTilePayload,
} from '../payload-validation'

describe('payload validation', () => {
  it('rejects invalid resource key', () => {
    const error = validateResourcePayload({
      playerId: 'p1',
      resource: 'gold',
      amount: 1,
    })
    expect(error?.code).toBe('INVALID_RESOURCE')
  })

  it('rejects invalid tile payload', () => {
    const single = validateSingleTilePayload({
      playerId: 'p1',
      tile: { row: 0 },
    })
    expect(single?.code).toBe('INVALID_TILE')

    const multi = validateMultiTilePayload({
      playerId: 'p1',
      tiles: [{ row: 0, col: 0 }, { row: 1 }],
    })
    expect(multi?.code).toBe('INVALID_TILE')
  })

  it('accepts valid payloads', () => {
    expect(
      validateResourcePayload({
        playerId: 'p1',
        resource: 'wood',
        amount: 2,
      }),
    ).toBeNull()
    expect(
      validateSingleTilePayload({
        playerId: 'p1',
        tile: { row: 0, col: 0 },
      }),
    ).toBeNull()
    expect(
      validateMultiTilePayload({
        playerId: 'p1',
        tiles: [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
      }),
    ).toBeNull()
  })
})
