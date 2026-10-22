import { describe, expect, it } from 'vitest'
import type { ActionFlow, PlayerState } from '../../../contract/types'
import { beginTurnScope, endTurnScope } from '../action-snapshot'
import { writeCardExtraData } from '../card-state'
import {
  isUsedThisTurn, isUsedThisTurnOrGap, markUsedThisTurnLeaf, markUsedThisTurnOrGapLeaf, readTurnScopeToken, USED_THIS_TURN_KEY,
} from '../turn-token'

const CARD_ID = 'A043_FarmyardManure'
const FRESHMAN = 'A097_Freshman'
const player = () => ({ id: 'p1', cardStates: {}, stableTiles: [], roomTiles: [], fenceSegments: [] }) as unknown as PlayerState

describe('turn-token', () => {
  it('records nothing outside a Turn', () => {
    const p = player()

    expect(readTurnScopeToken(p)).toBeUndefined()
    expect(markUsedThisTurnLeaf(p, CARD_ID)).toBeUndefined()
    expect(isUsedThisTurn(p, CARD_ID)).toBe(false)
  })

  it('marks the current Turn and forgets it in the next one', () => {
    const p = player()
    const token = beginTurnScope(p)

    expect(markUsedThisTurnLeaf(p, CARD_ID)).toEqual({
      type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: USED_THIS_TURN_KEY, value: token },
    })
    writeCardExtraData(p, CARD_ID, USED_THIS_TURN_KEY, token)
    expect(isUsedThisTurn(p, CARD_ID)).toBe(true)
    expect(isUsedThisTurn(p, CARD_ID, 'otherKey')).toBe(false)

    endTurnScope(p)
    expect(isUsedThisTurn(p, CARD_ID)).toBe(false)
    beginTurnScope(p)
    expect(isUsedThisTurn(p, CARD_ID)).toBe(false)
  })

  it('gives the gap between two of the player\'s Turns its own single record', () => {
    const p = player(), other = player()
    other.id = 'p2'
    const used = () => isUsedThisTurnOrGap(p, FRESHMAN)
    const record = () => {
      const leaf = markUsedThisTurnOrGapLeaf(p, FRESHMAN) as Extract<ActionFlow, { type: 'leaf' }>
      writeCardExtraData(p, FRESHMAN, USED_THIS_TURN_KEY, leaf.params?.value)
    }

    record()
    expect(used()).toBe(true)
    beginTurnScope(p)
    expect(used()).toBe(false)
    record()
    expect(used()).toBe(true)
    endTurnScope(p)
    expect(used()).toBe(false)
    record()
    expect(used()).toBe(true)
    expect(used()).toBe(true)
    expect(isUsedThisTurnOrGap(p, FRESHMAN, { kind: 'next-turn', playerId: p.id })).toBe(false)
    expect(isUsedThisTurnOrGap(p, FRESHMAN, { kind: 'next-turn', playerId: other.id })).toBe(true)
    beginTurnScope(p)
    expect(used()).toBe(false)
  })
})
