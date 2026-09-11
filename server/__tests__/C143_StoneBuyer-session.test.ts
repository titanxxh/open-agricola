import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C143_StoneBuyer'
import type { AnytimeAction } from '../../shared/contract/types';
import type { ActionFlow } from '../../shared/contract/types'

describe('C143_StoneBuyer session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C143_StoneBuyer')
    player.resources.food = 5
    player.resources.stone = 0
    player.occupationPlayed.push('C143_StoneBuyer')
    session.loadState(state)
    return session
  }

  const playThroughLessons = (accept: boolean) => {
    const session = new GameSession(7143, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((candidate, index) => {
      setWorkersAtHome(state, candidate, index === 0 ? 2 : 0)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.occupationPlayed = []
      candidate.cardStates = {}
      candidate.resources.food = 5
      candidate.resources.stone = 0
    })
    state.players[0]!.occupationHand = ['C143_StoneBuyer']
    session.loadState(state)

    let response = session.takeAction(0, 'lessons')
    if (response.state.players[0]!.occupationHand.includes('C143_StoneBuyer')) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return { session, response }
      response = session.resolveChoice(0, 'C143_StoneBuyer')
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return { session, response }
    const choice = accept
      ? response.interaction.request.options?.find((option) => option.value !== '__skip__')
      : response.interaction.request.options?.find((option) => option.value === '__skip__')
    expect(choice, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    return { session, response: session.resolveChoice(response.interaction.playerIndex, choice!.value) }
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('onBuy: flags this round before offering the optional two-stone purchase', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C143_StoneBuyer', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(2)
    expect(children[0]).toMatchObject({ actionId: 'special-effect', params: { kind: 'set-flag', flag: true } })
    expect(children[1]).toMatchObject({ type: 'seq', optional: true })
    if (children[1]?.type !== 'seq') throw new Error('expected optional purchase sequence')
    expect(children[1].children[0]).toMatchObject({ actionId: 'pay', params: { food: 1 } })
    expect(children[1].children[1]).toMatchObject({ actionId: 'gain', params: { stone: 2 } })
  })

  it('accepts the on-play offer through Session and buys exactly two stone for one food', () => {
    const { response } = playThroughLessons(true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('C143_StoneBuyer')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, stone: 2 })
    expect(isCardFlagged(response.state.players[0]!, 'C143_StoneBuyer')).toBe(true)
  })

  it('declines the on-play offer without paying food or gaining stone', () => {
    const { session, response } = playThroughLessons(false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('C143_StoneBuyer')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, stone: 0 })
    expect(isCardFlagged(response.state.players[0]!, 'C143_StoneBuyer')).toBe(true)
    const active = session.takeAction(0, 'farmland')
    expect(active.interaction.anytimeActions.map((action) => action.id))
      .not.toContain('C143-stone-buyer-anytime')
  })

  it('anytime not available same round when flagged from onBuy', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Simulate onBuy having executed (which flags the card)
    setCardFlag(player, 'C143_StoneBuyer', true)
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C143-stone-buyer-anytime')
  })

  it('after flag reset: pay 2 food, gain 1 stone, gets flagged', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Ensure card is not flagged (simulating flag was reset at start of turn)
    setCardFlag(player, 'C143_StoneBuyer', false)
    player.resources.food = 5
    player.resources.stone = 0
    session.loadState(state)

    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'C143-stone-buyer-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(3) // 5 - 2
    expect(updatedPlayer.resources.stone).toBe(1) // 0 + 1
    expect(isCardFlagged(updatedPlayer, 'C143_StoneBuyer')).toBe(true)
  })

  it('not available without 2 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, 'C143_StoneBuyer', false)
    player.resources.food = 1 // Not enough (need 2)
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C143-stone-buyer-anytime')
  })
})
