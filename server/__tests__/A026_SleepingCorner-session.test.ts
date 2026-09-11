import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A026_SleepingCorner'

const setup = (occupants: Array<{ player: number; worker: number; newborn?: boolean }>) => {
  const session = new GameSession(9826, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.roundActionOrder = [
    'wish-children',
    ...state.roundActionOrder.filter((spaceId) => spaceId !== 'wish-children'),
  ]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
  })
  const owner = state.players[0]!
  owner.minorPlayed = ['A026_SleepingCorner']
  owner.rooms = 3
  owner.roomTiles = Array.from({ length: 3 }, (_, row) => ({ row, col: 0 }))

  const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')!
  for (const occupant of occupants) {
    const player = state.players[occupant.player]!
    const worker = player.workers[occupant.worker]!
    worker.isNewborn = occupant.newborn === true
    wishChildren.takenBy.push({ playerId: player.id, workerId: worker.id })
  }
  session.loadState(state)
  return session
}

describe('A026 Sleeping Corner through Session', () => {
  it.each([
    { label: 'one opposing adult', occupants: [{ player: 1, worker: 0 }] },
    {
      label: 'one opposing adult plus a newborn',
      occupants: [{ player: 1, worker: 0 }, { player: 1, worker: 1, newborn: true }],
    },
  ])('offers and authoritatively accepts Wish for Children with $label', ({ occupants }) => {
    const session = setup(occupants)
    const beforeFamily = familySize(session.state.players[0]!)

    expect(session.getActionAvailability(0)['wish-children']).toBe(true)
    const response = session.takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(beforeFamily + 1)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ playerId: response.state.players[0]!.id }),
        expect.objectContaining({ playerId: response.state.players[1]!.id }),
      ]))
  })

  it.each([
    { label: 'two opposing adults', occupants: [{ player: 1, worker: 0 }, { player: 2, worker: 0 }] },
    { label: 'an opposing newborn', occupants: [{ player: 1, worker: 0, newborn: true }] },
    { label: 'the owner adult', occupants: [{ player: 0, worker: 0 }] },
  ])('does not offer or accept the occupied space for $label', ({ occupants }) => {
    const session = setup(occupants)
    const before = session.getState()
    const playerBefore = structuredClone(before.state.players[0])
    const occupantsBefore = structuredClone(
      before.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy,
    )

    expect(before.actionAvailability?.['wish-children']).toBe(false)
    const response = session.takeAction(0, 'wish-children')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]).toEqual(playerBefore)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy)
      .toEqual(occupantsBefore)
  })
})
