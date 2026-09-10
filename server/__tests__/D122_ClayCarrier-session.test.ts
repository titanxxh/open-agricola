import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D122_ClayCarrier'
import type { AnytimeAction } from '../../shared/contract/types';
import type { ActionFlow } from '../../shared/contract/types'

describe('D122_ClayCarrier session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D122_ClayCarrier')
    session.loadState(state)
    session.devPlayCard(0, 'D122_ClayCarrier')
    return session
  }

  /** Take farmland action to enter active interaction with a plow choice */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    // Should be in a choice state (plow select)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('card is registered as played after devPlayCard', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.occupationPlayed).toContain('D122_ClayCarrier')
  })

  it('onBuy returns a gain flow for 2 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'D122_ClayCarrier', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ clay: 2 })
  })

  it('anytime action appears during active interaction with food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('D122-clay-carrier-anytime')
  })

  it('anytime action not available without enough food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 1 // Not enough (need 2)
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('D122-clay-carrier-anytime')
  })

  it('anytime exchange: pay 2 food, gain 2 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.resources.clay = 0
    session.loadState(state)

    enterActiveInteraction(session)

    // Execute anytime action
    const resp2 = session.takeAnytimeAction(0, 'D122-clay-carrier-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(3) // 5 - 2
    expect(updatedPlayer.resources.clay).toBe(2) // 0 + 2
  })

  it('once per round: blocked after first use', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 10
    player.resources.clay = 0
    session.loadState(state)

    enterActiveInteraction(session)

    // Use anytime action first time
    const resp2 = session.takeAnytimeAction(0, 'D122-clay-carrier-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.food).toBe(8) // 10 - 2
    expect(resp2.state.players[0]!.resources.clay).toBe(2) // 0 + 2

    // Verify card is flagged
    expect(resp2.state.players[0]!.cardStates?.['D122_ClayCarrier']?.flagged).toBe(true)

    // Verify anytime action is no longer available
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('D122-clay-carrier-anytime')
  })

  it('flag resets via onBeforeStartOfTurn hook', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Manually flag the card (simulating it was used this round)
    setCardFlag(player, 'D122_ClayCarrier', true)
    expect(isCardFlagged(player, 'D122_ClayCarrier')).toBe(true)

    // Run onBeforeStartOfTurn hook directly
    runCardEffectHook(state, player, 'D122_ClayCarrier', 'onBeforeStartOfTurn')

    // Flag should be cleared
    expect(isCardFlagged(player, 'D122_ClayCarrier')).toBe(false)
  })
})

describe('D122 Clay Carrier parity', () => {
  const CARD_ID = 'D122_ClayCarrier'

  const ANYTIME_ID = 'D122-clay-carrier-anytime'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, food = 0 } = {}) => {
    const session = new GameSession(6122, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.food = food
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const enterActiveInteraction = (session: GameSession) => {
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  it('D122 S1: playing Clay Carrier immediately gains two clay', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('D122 S5: Clay Carrier becomes available again at the next round start', () => {
    const session = setup({ food: 4 })
    enterActiveInteraction(session)
    const used = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(used.ok, used.error).toBe(true)
    if (used.interaction.stateId === 'wait'
      && used.interaction.request.kind === 'confirm-next-player') confirmNextPlayer(session)
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))

    const nextRound = session.performRoundEnd()

    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.interaction.anytimeActions.map((action) => action.id)).toContain(ANYTIME_ID)
    const response = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 4 })
  })
})
