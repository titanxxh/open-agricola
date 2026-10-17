import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C019_SwingPlow'
import type { ActionChoiceOption } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('C019_SwingPlow session', () => {
  const setup = (stackSize = 4) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('C019_SwingPlow')
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['C019_SwingPlow'] = {
      stack: Array(stackSize).fill('field'),
    }

    session.loadState(state)
    return session
  }

  it('stack has 4 field tiles after setup', () => {
    const session = setup()
    const state = session.getState().state
    const stack = getCardStack(state.players[0]!, 'C019_SwingPlow')
    expect(stack.length).toBe(4)
  })

  it('using farmland offers up to 2 optional plows, accept both', () => {
    const session = setup()

    // Take farmland
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Complete farmland plow
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })
    expect(resp.ok).toBe(true)

    // First optional plow from card
    expect(resp.interaction.stateId).toBe('wait')
    const accept1 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(accept1).toBeDefined()
    resp = session.resolveChoice(0, accept1!.value)
    expect(resp.ok).toBe(true)

    // pop-card-stack runs, then plow tile selection
    expect(resp.interaction.stateId).toBe('wait')
    const tile2 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile2 })
    expect(resp.ok).toBe(true)

    // Second optional plow from card
    expect(resp.interaction.stateId).toBe('wait')
    const accept2 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(accept2).toBeDefined()
    resp = session.resolveChoice(0, accept2!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    const tile3 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile3 })
    expect(resp.ok).toBe(true)

    // Stack should have 2 fields left (4 - 2)
    const stack = getCardStack(resp.state.players[0]!, 'C019_SwingPlow')
    expect(stack.length).toBe(2)

    // Player should have 3 fields (farmland + 2 from card)
    expect(resp.state.players[0]!.fields.length).toBe(3)
  })

  it('accept first plow, skip second', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })

    // Accept first optional plow
    const accept1 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    resp = session.resolveChoice(0, accept1!.value)
    const tile2 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile2 })

    // Skip second optional plow
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Stack should have 3 fields left (4 - 1)
    const stack = getCardStack(resp.state.players[0]!, 'C019_SwingPlow')
    expect(stack.length).toBe(3)

    expect(resp.state.players[0]!.fields.length).toBe(2)
  })

  it('skip first plow skips both', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })

    // Skip first optional plow
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Stack unchanged
    const stack = getCardStack(resp.state.players[0]!, 'C019_SwingPlow')
    expect(stack.length).toBe(4)

    expect(resp.state.players[0]!.fields.length).toBe(1)
  })

  it('only 1 field left offers only 1 plow', () => {
    const session = setup(1) // only 1 field on card

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })

    // Accept the single optional plow
    expect(resp.interaction.stateId).toBe('wait')
    const accept1 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    resp = session.resolveChoice(0, accept1!.value)
    const tile2 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile2 })

    // Should not get another optional choice (stack is now empty)
    // Action should complete (no second plow offered)
    const stack = getCardStack(resp.state.players[0]!, 'C019_SwingPlow')
    expect(stack.length).toBe(0)
    expect(resp.state.players[0]!.fields.length).toBe(2)
  })

  it('no extra plow offered when stack is empty', () => {
    const session = setup(0) // empty stack

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })

    // No optional choice
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.fields.length).toBe(1)
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, finish, next, take, move, hand, buy, noSource, plow, accept, advanceOwner, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C019 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'C019_SwingPlow', s = minorSetup(card, 3, 3, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(getCardStack(r.state.players[0]!, card).length, 4)
    save('C019-N1-legal', r)
    {
      const t = minorSetup(card, 2, 3, 20, 14)
      t.state.players[0]!.resources.reed = 0
      t.loadState(t.state)
      let q = take(t, 'meeting-place')
      const branch = options(q).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        q = ok(t.resolveChoice(actor(q), branch.value))
      assert.ok(!options(q).some(o => o.value === card && !o.disabled), JSON.stringify(q.interaction))
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
        assertRejectedUnchanged(t, () => t.resolveChoice(actor(q), card))
      assert.ok(q.state.players[0]!.minorHand.includes(card))
      save('C019-N1-resource', q)
    }
    {
      const t = minorSetup(card, 3, 2, 20, 14)
      t.state.players[0]!.resources.reed = 0
      t.loadState(t.state)
      let q = take(t, 'meeting-place')
      const branch = options(q).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        q = ok(t.resolveChoice(actor(q), branch.value))
      assert.ok(!options(q).some(o => o.value === card && !o.disabled), JSON.stringify(q.interaction))
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
        assertRejectedUnchanged(t, () => t.resolveChoice(actor(q), card))
      assert.ok(q.state.players[0]!.minorHand.includes(card))
      save('C019-N1-prerequisite', q)
    }
  })
  it('C019 N2 actual purchased four field stock yields only two extras then naturally exhausts', () => { const card = 'C019_SwingPlow', s = minorSetup(card, 3, 3, 40, 5); let r = buy(s, card); advanceOwner(s, r); r = finish(s, take(s, 'farmland'), true); assert.equal(r.state.players[0]!.fields.length, 3); assert.equal(getCardStack(r.state.players[0]!, card).length, 2); save('C019-N2-first', r); next(s); r = finish(s, take(s, 'grain-seeds')); r = finish(s, confirmNext(s, r)); assert.equal(r.state.round, 6); r = finish(s, take(s, 'farmland'), true); assert.equal(r.state.players[0]!.fields.length, 6); assert.equal(getCardStack(r.state.players[0]!, card).length, 0); save('C019-N2-second', r); next(s); move(s, 'clay-pit'); next(s); move(s, 'fishing'); next(s); r = finish(s, take(s, 'reed-bank')); r = finish(s, confirmNext(s, r)); assert.equal(r.state.round, 7); r = finish(s, take(s, 'farmland'), true); assert.equal(r.state.players[0]!.fields.length, 7); save('C019-N2-exhausted', r); })
  it('C019 N3 declining each extra keeps purchased stock and Cultivation does not consume it', () => { const card = 'C019_SwingPlow', s = minorSetup(card, 3, 3); advanceOwner(s, buy(s, card)); let r = finish(s, take(s, 'farmland')); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(getCardStack(r.state.players[0]!, card).length, 4); save('C019-N3-decline', r); const t = minorSetup(card, 3, 3); advanceOwner(t, buy(t, card)); r = take(t, 'cultivation'); noSource(r, card); r = finish(t, r, true); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(getCardStack(r.state.players[0]!, card).length, 4); save('C019-N3-cultivation', r); const u = minorSetup(card, 3, 3); advanceOwner(u, buy(u, card)); let partial = plow(u, take(u, 'farmland')); partial = plow(u, accept(u, partial, card)); partial = finish(u, partial); assert.equal(partial.state.players[0]!.fields.length, 2); assert.equal(getCardStack(partial.state.players[0]!, card).length, 3); save('C019-N3-one', partial); })
  it('C019 N4 hand-only and opponent Farmland do not produce owner extra fields', () => { const card = 'C019_SwingPlow'; const s = setup(card, 14, st => hand(st, card)); let r = take(s, 'farmland'); noSource(r, card); r = finish(s, r, true); assert.equal(r.state.players[0]!.fields.length, 1); save('C019-N4-hand', r); const t = minorSetup(card, 3, 3); finish(t, buy(t, card)); next(t); r = take(t, 'farmland'); noSource(r, card); r = finish(t, r, true); assert.equal(r.state.players[1]!.fields.length, 1); assert.equal(getCardStack(r.state.players[0]!, card).length, 4); save('C019-N4-opponent', r); })
})
