import { describe, it, expect } from 'vitest'
import { passOccupationToNextPlayer } from '../pass-occupation'
import type { GameState, PlayerState } from '../../../contract/types'

const mkPlayer = (id: string, hand: string[]): PlayerState => ({
  id, name: id,
  resources: {},
  farmGrid: [], pastures: [], stableTiles: [], fields: [],
  occupationHand: [...hand], occupationPlayed: [],
  minorHand: [], minorPlayed: [], cardStates: {},
} as unknown as PlayerState)

describe('passOccupationToNextPlayer', () => {
  it('2-player: card moves from current to next', () => {
    const p1 = mkPlayer('p1', ['OCC_X', 'OCC_Y'])
    const p2 = mkPlayer('p2', [])
    const state = { players: [p1, p2] } as unknown as GameState
    const result = passOccupationToNextPlayer(state, p1, 'OCC_X')
    expect(result).toEqual({ target: 'next', cardId: 'OCC_X', fromPlayerId: 'p1', targetPlayerId: 'p2' })
    expect(p1.occupationHand).toEqual(['OCC_Y'])
    expect(p2.occupationHand).toEqual(['OCC_X'])
  })

  it('3-player: card moves to next seat from p1 to p2 (seat order)', () => {
    const p1 = mkPlayer('p1', ['OCC_X'])
    const p2 = mkPlayer('p2', [])
    const p3 = mkPlayer('p3', [])
    const state = { players: [p1, p2, p3] } as unknown as GameState
    const r = passOccupationToNextPlayer(state, p1, 'OCC_X')
    expect(r).toEqual({ target: 'next', cardId: 'OCC_X', fromPlayerId: 'p1', targetPlayerId: 'p2' })
    expect(p2.occupationHand).toEqual(['OCC_X'])
    expect(p3.occupationHand).toEqual([])
  })

  it('3-player: wraps from last seat to first', () => {
    const p1 = mkPlayer('p1', [])
    const p2 = mkPlayer('p2', [])
    const p3 = mkPlayer('p3', ['OCC_Z'])
    const state = { players: [p1, p2, p3] } as unknown as GameState
    const r = passOccupationToNextPlayer(state, p3, 'OCC_Z')
    expect(r).toEqual({ target: 'next', cardId: 'OCC_Z', fromPlayerId: 'p3', targetPlayerId: 'p1' })
    expect(p1.occupationHand).toEqual(['OCC_Z'])
  })

  it('solo (1 player): card is discarded', () => {
    const p1 = mkPlayer('p1', ['OCC_X'])
    const state = { players: [p1] } as unknown as GameState
    const r = passOccupationToNextPlayer(state, p1, 'OCC_X')
    expect(r).toEqual({ target: 'discard', cardId: 'OCC_X', fromPlayerId: 'p1' })
    expect(p1.occupationHand).toEqual([])
  })

  it('card not in hand: no mutation, returns discard', () => {
    const p1 = mkPlayer('p1', ['OCC_Y'])
    const p2 = mkPlayer('p2', [])
    const state = { players: [p1, p2] } as unknown as GameState
    const r = passOccupationToNextPlayer(state, p1, 'OCC_X')
    expect(r).toEqual({ target: 'discard', fromPlayerId: 'p1' })
    expect(p1.occupationHand).toEqual(['OCC_Y'])
    expect(p2.occupationHand).toEqual([])
  })
})
