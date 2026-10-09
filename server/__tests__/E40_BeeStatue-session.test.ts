import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E040_BeeStatue'

describe('E040_BeeStatue session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('E040_BeeStatue')
    player.resources.clay = 5
    session.loadState(state)
    session.devPlayCard(0, 'E040_BeeStatue')
    return session
  }

  it('onBuy places 5 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'E040_BeeStatue')
    expect(stack).toEqual(['vegetable', 'stone', 'grain', 'stone', 'grain'])
    expect(stack.length).toBe(5)
  })

  it('using day-laborer gains top good (grain) and stack shrinks', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Day laborer gives 1 food, plus bee statue gives grain (top of stack)
    expect(updatedPlayer.resources.grain).toBe(1)
    const stack = getCardStack(updatedPlayer, 'E040_BeeStatue')
    expect(stack.length).toBe(4)
    expect(stack[stack.length - 1]).toBe('stone') // new top
  })

  it('no trigger when stack is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    player.cardStates!['E040_BeeStatue']!.stack = []
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Only day laborer food, no grain from bee statue
    expect(updatedPlayer.resources.grain).toBe(0)
  })

  it('no trigger for other action spaces', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)

    // Use farmland instead of day-laborer
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(0)
    const stack = getCardStack(updatedPlayer, 'E040_BeeStatue')
    expect(stack.length).toBe(5) // unchanged
  })
})

describe('E040 Bee Statue parity', () => {
  const CARD_ID = 'E040_BeeStatue'

  const FILLER = '__test_placeholder__'

  const FULL_STACK = ['vegetable', 'stone', 'grain', 'stone', 'grain']

  const setup = ({ played = true, stack }: { played?: boolean; stack?: string[] } = {}) => {
    const session = new GameSession(6040, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.resources.clay = played ? 0 : 2
    if (played) owner.cardStates[CARD_ID] = { stack: stack ?? [...FULL_STACK] }
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  it('E040 S1: paying two clay plays Bee Statue with its fixed five-good stack', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(FULL_STACK)
  })

  it('E040 S2: successive Day Laborer uses take grain, stone, grain, stone, then vegetable', () => {
    let session = setup()
    const expected = ['grain', 'stone', 'grain', 'stone', 'vegetable'] as const

    for (const resource of expected) {
      const before = session.state.players[0]!.resources[resource]
      const response = session.takeAction(0, 'day-laborer')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[resource]).toBe(before + 1)
      if ((response.state.players[0]!.cardStates[CARD_ID]?.stack?.length ?? 0) > 0) {
        const next = setup({ stack: response.state.players[0]!.cardStates[CARD_ID]!.stack })
        next.state.players[0]!.resources = { ...response.state.players[0]!.resources }
        next.loadState(next.state)
        session = next
      }
    }

    expect(session.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual([])
  })
})
