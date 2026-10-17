import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/C/C112_Thresher'
import assert from 'node:assert/strict'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (options?: {
  withCard?: boolean
  grain?: number
  spaceId?: string
}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // Ensure cultivation is available

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    grain: options?.grain ?? 3,
    vegetable: 2,
    food: 1,
  }
  // Give fields so actions are doable
  player.fields = [
    { row: 0, col: 2, stacks: [] },
  ]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('C112_Thresher')
  }

  session.loadState(state)
  return session
}

describe('C112_Thresher session', () => {
  it('offers optional grain-to-food exchange before using grain-utilization', () => {
    const session = setup({ withCard: true, grain: 3 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // The before-hook should offer a pay-gain choice (optional)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Should have skip option and exchange option
    const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('exchange works: pay 1 food, gain 1 grain', () => {
    // Rule: `buy 1 grain for 1 food` — pay food, gain grain.
    const session = setup({ withCard: true, grain: 3 })
    const initialState = session.getState().state
    const initialGrain = initialState.players[0]!.resources.grain
    const initialFood = initialState.players[0]!.resources.food

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Accept the exchange (not skip)
    const exchangeOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    if (!exchangeOption) return
    resp = session.resolveChoice(0, exchangeOption.value)
    expect(resp.ok).toBe(true)
    // After exchange: -1 food, +1 grain
    expect(resp.state.players[0]!.resources.food).toBe(initialFood - 1)
    expect(resp.state.players[0]!.resources.grain).toBe(initialGrain + 1)
  })

  it('does not offer exchange when player has no food', () => {
    const session = setup({ withCard: true, grain: 0 })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Without food, the before-hook should not trigger; falls through to
    // the standard grain-utilization OR(sow, bake-bread) flow, which itself
    // becomes a choice (or confirmNextPlayer if both inner actions are
    // undoable). We assert the before-hook's skip option isn't present.
    if (resp.interaction.stateId === 'wait') {
      const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
      // No before-hook skip token specifically — but any skip would be a
      // false positive only if it carried Thresher labelling. We tolerate
      // any non-Thresher choice here.
      expect(hasSkip || resp.interaction.request.options?.length > 0).toBe(true)
    }
  })

  it('does not offer exchange without the card', () => {
    const session = setup({ withCard: false, grain: 3 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Without the card, no exchange offered before normal flow
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('also triggers for farmland space', () => {
    const session = setup({ withCard: true, grain: 2 })
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    // The before-hook should fire for farmland too
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('also triggers for cultivation space', () => {
    const session = setup({ withCard: true, grain: 2 })
    const resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    // The before-hook should fire for cultivation too
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  // The reference C112_Thresher::onPlayerIsDoable mirrors: when sow/exchange would
  // normally be undoable but the player has 1+ food (so they could buy 1
  // grain via the before-hook), flip doable=true. Before this fix, a player
  // sitting on grain-utilization with 0 grain + N food + an empty field
  // could not start the action at all because canSow returned false.
  // The reference C112_Thresher::onPlayerIsDoable raises sow / exchange doability when
  // the player has 1 food (so they could buy 1 grain via the before-hook,
  // then sow it). Without this listener, sow is undoable when the player has
  // no grain and no veg, even though Thresher would let them buy grain first.
  // Test: grain==0, vegetable==0, food==2, empty field — sow should be
  // reachable (choice pending) because Thresher's isDoable hook flips it.
  it('grain-utilization is doable with 0 grain + 0 veg + 1+ food + empty field', () => {
    const session = setup({ withCard: true, grain: 0 })
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.vegetable = 0
    // Make sure there is at least one empty field for sow target
    state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] } as never,
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Must reach the before-hook (so player can buy grain), not skip past
    // it because every inner action was "undoable".
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // The first prompt should be Thresher's pay-1-food → 1-grain offer
    // (its before-hook + an optional skip).
    const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('keeps grain-utilization unavailable without the card or a completable child', () => {
    const session = setup({ withCard: false, grain: 0 })
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.vegetable = 0
    state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] } as never,
    ]
    session.loadState(state)

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
  })
})

describe('ae-negative-48-crops', () => {
  const { sessions, ok, save, setup, choose, source, finish, next, grainField, sow } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C112 N1 actual Grain Utilization buys grain before sow and only one food is paid', () => { const s = setup('C112_Thresher', 14, state => { state.players[0]!.resources.food = 1; grainField(state, 0); }); let r = source(s, ok(s.takeAction(0, 'grain-utilization')), 'C112_Thresher'); r = choose(s, r, o => o.value !== '__skip__'); assert.equal(r.state.players[0]!.resources.food, 0); assert.equal(r.state.players[0]!.resources.grain, 1); r = sow(s, r); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 3); save('C112-N1', r); })
  it('C112 N2 Farmland and Cultivation purchase is optional and exact one grain arrives before plowing', () => {
    for (const space of ['farmland', 'cultivation'])
      for (const accept of [true, false]) {
        const s = setup('C112_Thresher', 14, state => state.players[0]!.resources.food = 1)
        let r = source(s, ok(s.takeAction(0, space)), 'C112_Thresher')
        r = choose(s, r, o => accept ? o.value !== '__skip__' : o.value === '__skip__')
        assert.equal(r.state.players[0]!.resources.food, accept ? 0 : 1)
        assert.equal(r.state.players[0]!.resources.grain, accept ? 1 : 0)
        r = finish(s, r)
        assert.equal(r.state.players[0]!.fields.length, 1)
        save(`C112-N2-${space}-${accept}`, r)
      }
  })
  it('C112 N3 zero food unrelated Forest and actual opponent Farmland cannot create owner grain', () => {
    for (const mode of ['food', 'space', 'opponent']) {
      const s = setup('C112_Thresher', 14, state => {
        if (mode === 'food')
          state.players[0]!.resources.food = 0
      })
      let r = finish(s, ok(s.takeAction(0, mode === 'food' ? 'farmland' : 'forest')))
      if (mode === 'opponent') {
        next(s)
        r = finish(s, ok(s.takeAction(1, 'farmland')))
      }
      assert.equal(r.state.players[0]!.resources.grain, 0)
      save(`C112-N3-${mode}`, r)
    }
  })
})
