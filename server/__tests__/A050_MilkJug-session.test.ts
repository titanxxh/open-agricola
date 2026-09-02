import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A050_MilkJug'

const CARD_ID = 'A050_MilkJug'

const purchaseSession = (clay: number) => {
  const session = new GameSession(50, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  setWorkersAtHome(state, state.players[0]!, 2)
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.clay = clay
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const actionSession = (actor: number) => {
  const session = new GameSession(50, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 12
  state.roundPhase = 'work'
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.resources.food = 0
    player.pastures = [{
      id: `pasture-${index}`,
      size: 1,
      tiles: [{ row: 0, col: index }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }]
  })
  state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 1
  session.loadState(state)
  return session
}

const useCattleMarket = (session: GameSession, actor: number) => {
  let response = session.takeAction(actor, 'cattle-market')
  expect(response.ok, response.error).toBe(true)
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg'
  ) {
    response = session.resolveChoice(actor, 'confirm', [{
      id: `pasture-${actor}`,
      zoneType: 'pasture',
      animalType: 'cattle',
      animalCount: 1,
    }])
  }
  while (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch'
  ) response = confirmPlayerSwitch(session)
  return response
}

describe('A050 Milk Jug parity', () => {
  it('A050 S1: playing Milk Jug costs one clay and keeps the card in play', () => {
    const response = playMinor(purchaseSession(1))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A050 S2: no clay keeps Milk Jug unavailable', () => {
    const session = purchaseSession(0)
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A050 S3: owner using Cattle Market gains three food and gives every other player one', () => {
    const response = useCattleMarket(actionSession(0), 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 1, 1, 1])
  })

  it('A050 S4: opponent using Cattle Market still rewards the owner and every other player', () => {
    const response = useCattleMarket(actionSession(1), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 1, 1, 1])
  })

  it('A050 S5: a non-Cattle-Market action does not trigger Milk Jug', () => {
    const session = actionSession(1)

    const response = session.takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 2, 0, 0])
  })
})
