import { describe, expect, it } from 'vitest'
import { cloneState, createInitialState } from '../state'

describe('cloneState', () => {
  it('preserves round and played cards', () => {
    const state = createInitialState(42)
    state.round = 6
    state.players[0].minorPlayed = ['A3_PaperKnife']
    state.players[0].playedCards = ['minor:A3_PaperKnife']

    const cloned = cloneState(state)

    expect(cloned.round).toBe(6)
    expect(cloned.players[0]?.minorPlayed).toEqual(['A3_PaperKnife'])
    expect(cloned.players[0]?.playedCards).toContain('minor:A3_PaperKnife')
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
