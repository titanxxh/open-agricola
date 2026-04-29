import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runBeforeEndGameHooks } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B133_VillagePeasant'
import '../../shared/cards/D/D60_LargePottery'

const CARD_ID = 'B133_VillagePeasant'

describe('B133_VillagePeasant session', () => {
  it('majors=0 → no vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.improvements = []
    player.minorPlayed = ['B133_VillagePeasant', 'A2_PieceOfLand']
    player.occupationPlayed = ['A1_Shelter', 'A10_WoodenShed']
    player.resources.vegetable = 0
    session.loadState(state)

    runBeforeEndGameHooks(state, player)
    expect(player.resources.vegetable).toBe(0)
  })

  it('majors=2, minors=2, occ=3 → +2 vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.improvements = ['Major_Joinery', 'Major_Pottery']
    player.minorPlayed = [CARD_ID, 'A2_PieceOfLand']
    player.occupationPlayed = ['A1_Shelter', 'A10_WoodenShed', 'A11_MudPatch']
    player.resources.vegetable = 0
    session.loadState(state)

    runBeforeEndGameHooks(state, player)
    expect(player.resources.vegetable).toBe(2)
  })

  it('dual-type minor (D60) counted on both sides', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.improvements = []
    player.minorPlayed = ['D60_LargePottery', 'A2_PieceOfLand']
    player.occupationPlayed = [CARD_ID, 'A1_Shelter', 'A10_WoodenShed']
    player.resources.vegetable = 0
    session.loadState(state)

    runBeforeEndGameHooks(state, player)
    // majors via alsoCountsAs = 1 (D60), minors = 2, occupations = 3 → min = 1
    expect(player.resources.vegetable).toBe(1)
  })

  it('player without B133: no vegetable change', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.improvements = ['Major_Joinery', 'Major_Pottery']
    player.minorPlayed = ['A2_PieceOfLand']
    player.occupationPlayed = ['A1_Shelter', 'A10_WoodenShed']
    player.resources.vegetable = 0
    session.loadState(state)

    runBeforeEndGameHooks(state, player)
    expect(player.resources.vegetable).toBe(0)
  })
})
