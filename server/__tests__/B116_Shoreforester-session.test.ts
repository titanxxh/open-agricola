import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B116_Shoreforester'

const CARD_ID = 'B116_Shoreforester'

const setup = () => {
  const session = new GameSession(116, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.resources.food = 10
  })
  state.players[0]!.occupationHand = [CARD_ID]
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let resp = session.takeAction(0, 'lessons')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (!option) return resp
  resp = session.resolveChoice(0, option.value)
  return resp
}

const setupRoundEnd = (reed: number) => {
  const session = new GameSession(116, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((current) => {
    current.resources.food = 10
    markAllWorkersUsed(state, current)
  })
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.resources.wood = 0
  const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
  if (!reedBank) throw new Error('reed-bank missing')
  reedBank.resources.reed = reed
  session.loadState(state)
  return session
}

describe('B116_Shoreforester session', () => {
  it('gains 1 wood when played through Lessons', () => {
    const session = setup()
    const resp = playOccupation(session)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('observes the Reed Bank after accumulation when it was empty before preparation', () => {
    const session = setupRoundEnd(0)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(2)
    expect(resp.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('does not gain wood when the Reed Bank was nonempty before preparation', () => {
    const session = setupRoundEnd(1)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(2)
    expect(resp.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(2)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })
})
