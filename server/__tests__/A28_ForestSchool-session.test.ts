import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A28_ForestSchool as A28Card } from '../../shared/cards/A/A28_ForestSchool'

import '../../shared/cards/A/A28_ForestSchool'
import '../../shared/cards/A/A123_FrameBuilder'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (withForestSchool: boolean) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.workersAvailable = 2
  player.resources = {
    ...player.resources,
    wood: withForestSchool ? 1 : 0,
    food: 0,
  }
  player.occupationHand = ['A123_FrameBuilder']
  player.occupationPlayed = ['D152_Patron']
  player.playedCards = [playedKey('D152_Patron', 'occupation')]

  if (withForestSchool) {
    player.minorPlayed.push('A28_ForestSchool')
    player.playedCards.push(playedKey('A28_ForestSchool', 'minor'))
    player.activeModifiers.push({ ...((A28Card as any).modifier ?? {}) })
  }

  const lessons = state.actionSpaces.find((space) => space.id === 'lessons')
  if (!lessons) throw new Error('lessons space missing')
  lessons.takenBy = state.players[1]!.id

  session.loadState(state)
  return session
}

describe('A28_ForestSchool session', () => {
  it('makes occupied lessons available only when the card is played', () => {
    const withCard = setup(true).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.pending.type).toBe('none')
    expect(withCard.actionAvailability?.lessons).toBe(true)

    const withoutCardSession = setup(false)
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.lessons).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('lets the player use occupied lessons without overwriting the occupant', () => {
    const session = setup(true)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.workersAvailable).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152_Patron grants 2 food before playing an occupation
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationHand).not.toContain('A123_FrameBuilder')
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })
})
