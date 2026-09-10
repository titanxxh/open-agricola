import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D062_BeerTap'

const CARD_ID = 'D062_BeerTap'
const FILLER = '__test_placeholder__'

const setupPurchase = () => {
  const session = new GameSession(6062, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.resources.wood = 1
  owner.resources.food = 0
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const setupHarvest = (grain: number) => {
  const session = new GameSession(6200 + grain, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.grain = grain
  session.loadState(state)
  return session
}

const enterFeed = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let guard = 0; guard < 10 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind !== 'feed'; guard += 1) {
    const skip = response.interaction.request.options?.find((option) =>
      option.value === '__skip__' || option.value === '__done__')
    expect(skip, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, skip!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected feeding interaction')
  expect(response.interaction.request.kind).toBe('feed')
  return response
}

const selection = (exchangeIndex: number, count = 1) => ({
  sourceId: CARD_ID, exchangeIndex, count, sourceName: 'Beer Tap',
})

describe('D062 Beer Tap parity', () => {
  it('D062 S1: paying one wood plays Beer Tap and immediately gains two food', () => {
    const response = playMinor(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  })

  for (const [scenario, grain, food, exchangeIndex] of [
    ['S2', 2, 3, 0],
    ['S3', 3, 6, 1],
    ['S4', 4, 9, 2],
  ] as const) {
    it(`D062 ${scenario}: ${grain} grain become ${food} food during feeding`, () => {
      const session = setupHarvest(grain)
      enterFeed(session)

      const response = session.resolveChoice(0, 'confirm', {
        selections: [selection(exchangeIndex)],
      })

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 16 + food })
    })
  }

  it('D062 S5: the feeding exchange may be declined', () => {
    const session = setupHarvest(4)
    enterFeed(session)

    const response = session.resolveChoice(0, 'confirm', { selections: [] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 4, food: 16 })
  })

  it('D062 S6: the two-grain exchange can be used twice in one feeding phase', () => {
    const session = setupHarvest(4)
    enterFeed(session)

    const response = session.resolveChoice(0, 'confirm', { selections: [selection(0, 2)] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 22 })
  })

  it('D062 S7: two different Beer Tap tiers can be combined in one feeding phase', () => {
    const session = setupHarvest(5)
    enterFeed(session)

    const response = session.resolveChoice(0, 'confirm', {
      selections: [selection(0), selection(1)],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 25 })
  })
  it('rejects a batch exceeding available grain without any partial exchange or feeding', () => {
    const session = setupHarvest(3)
    const pending = enterFeed(session)
    const response = session.resolveChoice(0, 'confirm', { selections: [selection(0, 2)] })
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(pending.state)
    expect(response.interaction).toEqual(pending.interaction)
  })

})
