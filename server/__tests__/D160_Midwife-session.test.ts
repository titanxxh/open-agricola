import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import '../../shared/cards/D/D160_Midwife'

const CARD_ID = 'D160_Midwife'

const setup = (
  currentPlayerIndex: number,
  spaceId: 'wish-children' | 'urgent-wish-children' = 'wish-children',
  priorPlacement = false,
) => {
  const session = new GameSession(160, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = currentPlayerIndex
  state.round = spaceId === 'urgent-wish-children' ? 5 : 2
  state.roundActionOrder = state.roundActionOrder.map((id) => id === spaceId ? null : id)
  state.roundActionOrder[0] = spaceId
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources.grain = 0
  owner.rooms = 3
  const actor = state.players[currentPlayerIndex]!
  actor.rooms = 3
  if (priorPlacement) recordRoundPlacement(actor, 'forest', actor.workers[0]!.id)
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} space missing`)
  space.takenBy = []
  session.loadState(state)
  return session
}

describe('D160_Midwife session', () => {
  it('D160 S1 owner gains one grain from an opponent first-placement Family Growth', () => {
    const session = setup(1)
    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)

    const response = session.takeAction(1, 'wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D160 S2 owner gains one grain from an opponent first-placement urgent Family Growth', () => {
    const session = setup(1, 'urgent-wish-children')
    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)

    const response = session.takeAction(1, 'urgent-wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D160 S3 owner gains nothing when Family Growth is not the opponent first placement', () => {
    const session = setup(1, 'wish-children', true)

    const response = session.takeAction(1, 'wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('D160 S4 owner gains nothing from their own Family Growth', () => {
    const session = setup(0)

    const response = session.takeAction(0, 'wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('D160 S5 owner gains nothing from an opponent non-Family-Growth placement', () => {
    const session = setup(1)

    const response = session.takeAction(1, 'day-laborer')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
