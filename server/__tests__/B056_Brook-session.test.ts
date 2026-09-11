import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B056_Brook'

const setup = ({
  playerCount = 3, roundOne = 'grain-utilization', secondRound = 'sheep-market',
}: { playerCount?: number; roundOne?: string; secondRound?: string } = {}) => {
  const session = new GameSession(9856 + playerCount, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.roundActionOrder = [
    roundOne,
    secondRound,
    ...state.roundActionOrder.filter((spaceId) => spaceId !== roundOne && spaceId !== secondRound),
  ]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
  })
  const owner = state.players[0]!
  owner.minorPlayed = ['B056_Brook']
  owner.resources.food = 0
  owner.resources.grain = 1
  owner.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
  for (const [spaceId, resource] of [
    ['forest', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed'], ['sheep-market', 'sheep'],
  ] as const) {
    state.actionSpaces.find((space) => space.id === spaceId)!.resources[resource] = 1
  }
  session.loadState(state)
  return session
}

const chooseSow = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.kind === 'farm-select') return response
  const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
  expect(sow, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, sow!.value)
}

describe('B056 Brook through Session', () => {
  it.each(['forest', 'clay-pit', 'reed-bank'])('grants one food on fixed Brook space %s', (spaceId) => {
    const response = setup().takeAction(0, spaceId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it.each([2, 4])('uses the actual round-one card in a %i-player game', (playerCount) => {
    const session = setup({ playerCount })
    chooseSow(session, session.takeAction(0, 'grain-utilization'))
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('does not treat another stage-one round card as the round-one target', () => {
    const response = setup().takeAction(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('does not treat the multiplayer Hollow starting space as a Brook target', () => {
    const response = setup({ playerCount: 3 }).takeAction(0, 'hollow')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})
