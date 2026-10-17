import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E111_Recluse'
import assert from 'node:assert/strict'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

describe('E111_Recluse session', () => {
  const setup = (options?: { withMinor?: boolean }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('E111_Recluse')
    player.resources.food = 0
    player.resources.wood = 0
    if (options?.withMinor) {
      player.minorPlayed.push('STUB_MINOR')
    }
    session.loadState(state)
    session.devPlayCard(0, 'E111_Recluse')
    return session
  }

  it('onRoundStart grants 1 food when no minor improvements played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.minorPlayed.length).toBe(0)

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart'))
    expect(flow).not.toBeNull()
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: 'E111_Recluse',
    })
  })

  it('onRoundStart does NOT grant food when minor improvements are played', () => {
    const session = setup({ withMinor: true })
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.minorPlayed.length).toBe(1)

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart'))
    expect(flow).toBeNull()
  })

  it('onStartHarvest grants 1 wood when no minor improvements played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.minorPlayed.length).toBe(0)

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onStartHarvest'))
    expect(flow).not.toBeNull()
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { wood: 1 },
      sourceCard: 'E111_Recluse',
    })
  })

  it('onStartHarvest does NOT grant wood when minor improvements are played', () => {
    const session = setup({ withMinor: true })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onStartHarvest'))
    expect(flow).toBeNull()
  })

  it('stops granting benefits after a minor improvement is played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Initially no minors → should grant food
    let flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart'))
    expect(flow).not.toBeNull()

    // Play a minor improvement
    player.minorPlayed.push('STUB_MINOR')

    // Should no longer grant food
    flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onRoundStart'))
    expect(flow).toBeNull()

    // Should no longer grant wood at harvest
    flow = session.withCtx(() => runCardEffectHook(state, player, 'E111_Recluse', 'onStartHarvest'))
    expect(flow).toBeNull()
  })
})

describe('ae-negative-48-crops', () => {
  const { sessions, save, setup, finish, completeRound } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E111 N1 actual harvest and next round reward only no played minor while major and hand minor do not suppress', () => {
    for (const mode of ['none', 'minor', 'major', 'hand']) {
      const s = setup('E111_Recluse', 4, state => {
        if (mode === 'minor')
          state.players[0]!.minorPlayed.push('B007_Wage')
        if (mode === 'major')
          state.players[0]!.improvements.push('Major_Fireplace1')
        if (mode === 'hand')
          state.players[0]!.minorHand = ['B007_Wage']
      })
      const r = finish(s, completeRound(s))
      assert.equal(r.state.round, 5)
      assert.equal(r.state.players[0]!.resources.wood, mode === 'minor' ? 0 : 1)
      assert.equal(r.state.players[0]!.resources.food, mode === 'minor' ? 17 : 18)
      assert.equal(r.state.players[1]!.resources.wood, 3)
      save(`E111-N1-${mode}`, r)
    }
  })
  it('E111 N2 card only in hand gives neither harvest wood nor next round food', () => { const s = setup('E111_Recluse', 4, state => { state.players[0]!.occupationPlayed = []; state.players[0]!.occupationHand = ['E111_Recluse']; }); const r = finish(s, completeRound(s)); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.food, 17); save('E111-N2', r); })
})
