import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C143_StoneBuyer'
import type { AnytimeAction } from '../../shared/contract/types';
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('C143_StoneBuyer session', () => {
  const setup = () => {
    const session = new GameSession(42)
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
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'C143_StoneBuyer', 'onBuy'))
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

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, completeRound, play } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C143 N1 real immediate purchase and two natural resets enforce one later purchase per round', () => {
    const s = setup('C143_StoneBuyer', 5, state => state.players[0]!.resources.food = 10)
    let r = finish(s, play(s, 'C143_StoneBuyer'), true)
    assert.equal(r.state.players[0]!.resources.food, 9)
    assert.equal(r.state.players[0]!.resources.stone, 2)
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C143-stone-buyer-anytime'))
    r = finish(s, completeRound(s, ['forest', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer']))
    assert.equal(r.state.round, 6)
    assert.equal(r.state.players[0]!.resources.food, 10)
    r = finish(s, ok(s.takeAnytimeAction(0, 'C143-stone-buyer-anytime')), true)
    assert.equal(r.state.players[0]!.resources.food, 8)
    assert.equal(r.state.players[0]!.resources.stone, 3)
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C143-stone-buyer-anytime'))
    r = finish(s, completeRound(s, ['forest', 'clay-pit', 'reed-bank', 'grove', 'fishing', 'grain-seeds']))
    assert.equal(r.state.round, 7)
    r = finish(s, ok(s.takeAnytimeAction(0, 'C143-stone-buyer-anytime')), true)
    assert.equal(r.state.players[0]!.resources.food, 6)
    assert.equal(r.state.players[0]!.resources.stone, 4)
    save('C143-N1', r)
  })
  it('C143 N2 immediate decline and forced one-food later attempt preserve resources', () => {
    for (const mode of ['decline', 'short']) {
      const s = setup('C143_StoneBuyer', 5, state => state.players[0]!.resources.food = mode === 'decline' ? 10 : 0)
      let r = finish(s, play(s, 'C143_StoneBuyer'))
      assert.equal(r.state.players[0]!.resources.stone, 0)
      assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C143-stone-buyer-anytime'))
      if (mode === 'short') {
        r = finish(s, completeRound(s, ['forest', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer']))
        assert.equal(r.state.round, 6)
        assert.equal(r.state.players[0]!.resources.food, 1)
        assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C143-stone-buyer-anytime'))
        assert.equal(s.state.players[0]!.resources.stone, 0)
      }
      save(`C143-N2-${mode}`, s.getState())
    }
  })
})
