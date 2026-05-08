import { describe, expect, it } from 'vitest'
import { cloneState, createInitialState } from '../state-bootstrap'
import { getPlayedCardKeys } from '../../domain/player'

describe('cloneState', () => {
  it('preserves round and derives played cards from canonical arrays', () => {
    const state = createInitialState(42)
    state.round = 6
    state.players[0].minorPlayed = ['A3_PaperKnife']

    const cloned = cloneState(state)

    expect(cloned.round).toBe(6)
    expect(cloned.players[0]?.minorPlayed).toEqual(['A3_PaperKnife'])
    expect(getPlayedCardKeys(cloned.players[0]!)).toContain('minor:A3_PaperKnife')
  })

  it('initializes playedCards as empty array on created and cloned players', () => {
    const state = createInitialState(42)
    const cloned = cloneState(state)

    expect(state.players[0].playedCards).toEqual([])
    expect(cloned.players[0].playedCards).toEqual([])
  })

  it('does not share nested references', () => {
    const state = createInitialState(42)
    const cloned = cloneState(state)

    cloned.players[0].resources.wood = 99
    cloned.players[0].roomTiles.push({ row: 2, col: 2 })

    expect(state.players[0].resources.wood).not.toBe(99)
    expect(state.players[0].roomTiles).not.toHaveLength(cloned.players[0].roomTiles.length)
  })
})
