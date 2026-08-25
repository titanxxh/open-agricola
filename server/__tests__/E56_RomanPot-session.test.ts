import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E056_RomanPot'

const CARD_ID = 'E056_RomanPot'

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

describe('E056_RomanPot session', () => {
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

  it('last player in frozen turn order gets 1 food at start of work phase', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.round = 1
    state.roundFirstPlayerId = state.players[1]!.id

    const lastPlayer = state.players[0]!
    lastPlayer.minorPlayed.push(CARD_ID)
    if (!lastPlayer.cardStates) lastPlayer.cardStates = {}
    lastPlayer.cardStates[CARD_ID] = {
      extraData: { foodCount: 4 },
      infobox: '4 Food',
    }
    lastPlayer.resources.food = 5

    session.loadState(state)

    const hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onRoundStart')
    // The hook should return a gain flow for last player
    expect(hook).toBeDefined()
    expect(hook?.type).toBe('leaf')
  })

  it('physical last player does NOT get food when not last in frozen turn order', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.round = 1
    state.roundFirstPlayerId = state.players[1]!.id

    const physicalLastPlayer = state.players[2]!
    physicalLastPlayer.minorPlayed.push(CARD_ID)
    if (!physicalLastPlayer.cardStates) physicalLastPlayer.cardStates = {}
    physicalLastPlayer.cardStates[CARD_ID] = {
      extraData: { foodCount: 4 },
      infobox: '4 Food',
    }
    physicalLastPlayer.resources.food = 5

    session.loadState(state)

    const hook = runCardEffectHook(state, physicalLastPlayer, CARD_ID, 'onRoundStart')
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

    const hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onRoundStart')
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
    let hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onRoundStart')
    expect(hook).toBeDefined()
    expect(readCardExtraData<number>(lastPlayer, CARD_ID, 'foodCount')).toBe(2)

    // Second trigger
    hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onRoundStart')
    expect(hook).toBeDefined()
    expect(readCardExtraData<number>(lastPlayer, CARD_ID, 'foodCount')).toBe(1)

    // Third trigger
    hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onRoundStart')
    expect(hook).toBeDefined()
    expect(readCardExtraData<number>(lastPlayer, CARD_ID, 'foodCount')).toBe(0)

    // Fourth trigger - empty
    hook = runCardEffectHook(state, lastPlayer, CARD_ID, 'onRoundStart')
    expect(hook).toBeNull()
  })
})
