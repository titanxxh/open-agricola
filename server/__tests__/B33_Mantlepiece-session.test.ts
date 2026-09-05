import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B033_Mantlepiece } from '../../shared/cards/B/B033_Mantlepiece'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'

const CARD_ID = 'B033_Mantlepiece'

describe('B033_Mantlepiece prerequisite', () => {
  it('blocks when player still lives in a wooden house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    expect(meetsCardPrerequisites(player, B033_Mantlepiece, state.round, state)).toBe(false)
  })

  it('allows when player lives in a clay house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, B033_Mantlepiece, state.round, state)).toBe(true)
  })

  it('allows when player lives in a stone house', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'stone'
    expect(meetsCardPrerequisites(player, B033_Mantlepiece, state.round, state)).toBe(true)
  })

  it('rejects renovation before placing a worker once Mantlepiece is played', () => {
    const session = new GameSession(33, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    const player = state.players[0]!
    player.houseType = 'clay'
    player.minorPlayed = [CARD_ID]
    player.resources.stone = player.rooms
    player.resources.reed = 1
    setWorkersAtHome(state, player, 2)
    const redevelopment = state.actionSpaces.find((space) => space.id === 'house-redevelopment')
    if (!redevelopment) throw new Error('house-redevelopment missing')
    redevelopment.takenBy = []
    session.loadState(state)

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: player.rooms, reed: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'house-redevelopment')?.takenBy).toEqual([])
  })

  it('rejects Farm Redevelopment before placing a worker once Mantlepiece is played', () => {
    const session = new GameSession(33, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    const player = state.players[0]!
    player.houseType = 'clay'
    player.minorPlayed = [CARD_ID]
    player.resources.stone = player.rooms
    player.resources.reed = 1
    player.resources.wood = 20
    setWorkersAtHome(state, player, 2)
    const redevelopment = state.actionSpaces.find((space) => space.id === 'farm-redevelopment')
    if (!redevelopment) throw new Error('farm-redevelopment missing')
    redevelopment.takenBy = []
    session.loadState(state)

    const response = session.takeAction(0, 'farm-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-redevelopment')?.takenBy).toEqual([])
  })
})
