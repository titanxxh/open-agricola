import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/E/E56_RomanPot'

const CARD_ID = 'E56_RomanPot'

const setup = (options?: { playerCount?: number; foodCount?: number }) => {
  const playerCount = options?.playerCount ?? 2
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 5
  player.resources.clay = 5

  // Manually add card since it's not in catalog.ts
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: options?.foodCount ?? 4 },
    infobox: `${options?.foodCount ?? 4} Food`,
  }

  session.loadState(state)
  return session
}

describe('E56_RomanPot session', () => {
  it('onBuy sets foodCount to 4', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    if (!player.cardStates) player.cardStates = {}

    // Trigger onBuy manually
    runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(4)
  })

  it('last player in turn order gets 1 food at start of work phase', () => {
    // 2-player game, player at index 1 is last
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    // Put card on last player (index 1)
    const lastPlayer = state.players[1]!
    lastPlayer.minorPlayed.push(CARD_ID)
    if (!lastPlayer.cardStates) lastPlayer.cardStates = {}
    lastPlayer.cardStates[CARD_ID] = {
      extraData: { foodCount: 4 },
      infobox: '4 Food',
    }
    lastPlayer.resources.food = 5

    session.loadState(state)

    // Simulate onBeforeStartOfTurn by calling it directly
    const hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onBeforeStartOfTurn')
    // The hook should return a gain flow for last player
    expect(hook).toBeDefined()
    expect(hook?.type).toBe('leaf')
  })

  it('non-last player does NOT get food at start of work phase', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    // Put card on first player (index 0) - NOT the last
    const firstPlayer = state.players[0]!
    firstPlayer.minorPlayed.push(CARD_ID)
    if (!firstPlayer.cardStates) firstPlayer.cardStates = {}
    firstPlayer.cardStates[CARD_ID] = {
      extraData: { foodCount: 4 },
      infobox: '4 Food',
    }
    firstPlayer.resources.food = 5

    session.loadState(state)

    const hook = runCardEffectHook(state, firstPlayer, CARD_ID, 'onBeforeStartOfTurn')
    // The hook should NOT return a flow for the first player
    expect(hook).toBeNull()
  })

  it('does not release food when card is empty', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const lastPlayer = state.players[1]!
    lastPlayer.minorPlayed.push(CARD_ID)
    if (!lastPlayer.cardStates) lastPlayer.cardStates = {}
    lastPlayer.cardStates[CARD_ID] = {
      extraData: { foodCount: 0 },
      infobox: '0 Food',
    }

    session.loadState(state)

    const hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onBeforeStartOfTurn')
    expect(hook).toBeNull()
  })

  it('foodCount decrements each time food is released', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const lastPlayer = state.players[1]!
    lastPlayer.minorPlayed.push(CARD_ID)
    if (!lastPlayer.cardStates) lastPlayer.cardStates = {}
    lastPlayer.cardStates[CARD_ID] = {
      extraData: { foodCount: 3 },
      infobox: '3 Food',
    }

    session.loadState(state)

    // First trigger
    let hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onBeforeStartOfTurn')
    expect(hook).toBeDefined()
    expect(readCardExtraData<number>(lastPlayer, CARD_ID, 'foodCount')).toBe(2)

    // Second trigger
    hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onBeforeStartOfTurn')
    expect(hook).toBeDefined()
    expect(readCardExtraData<number>(lastPlayer, CARD_ID, 'foodCount')).toBe(1)

    // Third trigger
    hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onBeforeStartOfTurn')
    expect(hook).toBeDefined()
    expect(readCardExtraData<number>(lastPlayer, CARD_ID, 'foodCount')).toBe(0)

    // Fourth trigger - empty
    hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onBeforeStartOfTurn')
    expect(hook).toBeNull()
  })
})
