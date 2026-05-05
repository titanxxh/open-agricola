import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome, workersAvailable } from '../../shared/game/player'
import '../../shared/cards/B/B151_LittlePeasant'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setupOccupiedSpaceSession = (options?: {
  withCard?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.houseType = options?.houseType ?? 'wood'
  player.rooms = options?.rooms ?? 2

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('B151_LittlePeasant')
  }

  const opponentId = state.players[1]!.id
  const forest = state.actionSpaces.find((space) => space.id === 'forest')
  const meetingPlace = state.actionSpaces.find((space) => space.id === 'meeting-place')
  if (!forest || !meetingPlace) throw new Error('required action space missing')
  forest.takenBy = opponentId
  meetingPlace.takenBy = opponentId

  session.loadState(state)
  return session
}

const setupPlaySession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = ['B151_LittlePeasant']

  session.loadState(state)
  return session
}

describe('B151_LittlePeasant session', () => {
  it('treats occupied non-meeting-place spaces as available only in a 2-room wooden house', () => {
    const withCard = setupOccupiedSpaceSession({ withCard: true }).getState()
    expect(withCard.actionAvailability?.forest).toBe(true)
    expect(withCard.actionAvailability?.['meeting-place']).toBe(false)

    const withoutCard = setupOccupiedSpaceSession({ withCard: false }).getState()
    expect(withoutCard.actionAvailability?.forest).toBe(false)

    const wrongRooms = setupOccupiedSpaceSession({ withCard: true, rooms: 3 }).getState()
    expect(wrongRooms.actionAvailability?.forest).toBe(false)

    const wrongHouse = setupOccupiedSpaceSession({ withCard: true, houseType: 'clay' }).getState()
    expect(wrongHouse.actionAvailability?.forest).toBe(false)
  })

  it('lets the player use occupied forest without overwriting the occupant', () => {
    const session = setupOccupiedSpaceSession({ withCard: true })

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBeGreaterThan(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('gives 1 stone when the occupation is played', () => {
    const session = setupPlaySession()

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.occupationPlayed).toContain('B151_LittlePeasant')
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })
})
