import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, familySize, newbornCount } from '../../shared/game/player'
import '../../shared/cards/C/C129_SecondSpouse'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (options?: {
  withCard?: boolean
  playerCount?: number
  occupyUrgentWishChildren?: boolean
}) => {
  const playerCount = options?.playerCount ?? 3
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5

  // Ensure urgent-wish-children is open at round 1 (so it's available at round 5)
  state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
    spaceId === 'urgent-wish-children' ? null : spaceId,
  )
  state.roundActionOrder[0] = 'urgent-wish-children'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  setActiveWorkerCount(player, 2)
  player.rooms = 3

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('C129_SecondSpouse')
  }

  if (options?.occupyUrgentWishChildren ?? true) {
    const urgentWishChildren = state.actionSpaces.find(
      (space) => space.id === 'urgent-wish-children',
    )
    if (urgentWishChildren) {
      urgentWishChildren.takenBy = state.players[1]!.id
    }
  }

  session.loadState(state)
  return session
}

describe('C129_SecondSpouse session', () => {
  it('makes occupied urgent-wish-children available with card in 3+ player game', () => {
    const withCard = setup({ withCard: true, playerCount: 3 }).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.actionAvailability?.['urgent-wish-children']).toBe(true)
  })

  it('does not allow using occupied urgent-wish-children without the card', () => {
    const session = setup({ withCard: false, playerCount: 3 })
    const state = session.getState()
    expect(state.actionAvailability?.['urgent-wish-children']).toBe(false)

    const failedTake = session.takeAction(0, 'urgent-wish-children')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('does not work in 2-player games', () => {
    const session = setup({ withCard: true, playerCount: 2 })
    const state = session.getState()
    expect(state.actionAvailability?.['urgent-wish-children']).toBe(false)
  })

  it('lets the player use occupied urgent-wish-children without overwriting occupant', () => {
    const session = setup({ withCard: true, playerCount: 3 })

    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(true)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(newbornCount(resp.state.players[0]!)).toBe(1)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    // Occupant should not change
    const urgentSpace = resp.state.actionSpaces.find(
      (space) => space.id === 'urgent-wish-children',
    )
    expect(urgentSpace?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('does not allow if occupied by own farmer', () => {
    const session = setup({ withCard: true, playerCount: 3, occupyUrgentWishChildren: false })
    const state = session.getState().state
    // Occupy with own player's farmer
    const urgentWishChildren = state.actionSpaces.find(
      (space) => space.id === 'urgent-wish-children',
    )
    if (urgentWishChildren) {
      urgentWishChildren.takenBy = state.players[0]!.id
    }
    session.loadState(state)

    const result = session.getState()
    expect(result.actionAvailability?.['urgent-wish-children']).toBe(false)
  })

  it('does not affect normal wish-children space', () => {
    const session = setup({ withCard: true, playerCount: 3 })
    const state = session.getState().state
    // Also make wish-children available and occupy it
    state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
      spaceId === 'wish-children' ? null : spaceId,
    )
    state.roundActionOrder[1] = 'wish-children'
    const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (wishChildren) {
      wishChildren.takenBy = state.players[1]!.id
    }
    session.loadState(state)

    const result = session.getState()
    // wish-children should still be unavailable (card only affects urgent-wish-children)
    expect(result.actionAvailability?.['wish-children']).toBe(false)
  })
})
