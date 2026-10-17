import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/D/D020_TurnwrestPlow'
import type { ActionChoiceOption } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('D020_TurnwrestPlow session', () => {
  const setup = (round = 1) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.minorPlayed.push('D020_TurnwrestPlow')
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['D020_TurnwrestPlow'] = { stack: ['field', 'field'] }

    session.loadState(state)
    return session
  }

  it('stack has 2 field tiles after setup', () => {
    const session = setup()
    const state = session.getState().state
    const stack = getCardStack(state.players[0]!, 'D020_TurnwrestPlow')
    expect(stack).toEqual(['field', 'field'])
  })

  it('triggers on farmland, accept both plows', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })
    expect(resp.ok).toBe(true)

    // First optional plow
    expect(resp.interaction.stateId).toBe('wait')
    const accept1 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(accept1).toBeDefined()
    resp = session.resolveChoice(0, accept1!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    const tile2 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile2 })
    expect(resp.ok).toBe(true)

    // Second optional plow
    expect(resp.interaction.stateId).toBe('wait')
    const accept2 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(accept2).toBeDefined()
    resp = session.resolveChoice(0, accept2!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    const tile3 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile3 })
    expect(resp.ok).toBe(true)

    // Stack should be empty (2 - 2)
    const stack = getCardStack(resp.state.players[0]!, 'D020_TurnwrestPlow')
    expect(stack.length).toBe(0)

    // 3 fields (farmland + 2 from card)
    expect(resp.state.players[0]!.fields.length).toBe(3)
  })

  it('triggers on cultivation action space', () => {
    // Cultivation appears in round 5
    const session = setup(5)

    let resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)

    // S2 Task 5/8 (post-farm-select kind): D20's `after place-farmer` hook
    // prepends its optional metadata host before cultivation's main OrNode,
    // so the first surfaced choice is the D20 'do/skip' prompt — accept it.
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionOptionalAction') {
      const acceptStack = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      expect(acceptStack).toBeDefined()
      resp = session.resolveChoice(0, acceptStack!.value)
    }

    // Now drive the D20-stack plow leaf → farm-select.
    expect(resp.interaction.stateId).toBe('wait')
    const tile1 = resp.interaction.request.farm?.selectableTiles[0]
    expect(tile1).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile: tile1 })
    expect(resp.ok).toBe(true)

    // After D20 plow, the cultivation OrNode 'plow vs sow' choice surfaces.
    // Walk through sow if offered (decline it).
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.options?.some((o: ActionChoiceOption) => o.labelKey?.includes('sow') || o.labelKey?.includes('Sow'))) {
      resp = session.resolveChoice(0, '__skip__')
    }

    // Cultivation's main plow choice (or another D20 optional plow) surfaces next.
    expect(resp.interaction.stateId).toBe('wait')
    const accept1 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    if (accept1) {
      resp = session.resolveChoice(0, accept1!.value)
      expect(resp.ok).toBe(true)
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.farm) {
        const tile2 = resp.interaction.request.farm.selectableTiles[0]
        resp = session.commitSelectionChoice(0, { tile: tile2 })
        expect(resp.ok).toBe(true)
      }
    }

    // Stack should have ≤ 1 field left (depending on whether we used 1 or 2 plows).
    const stack = getCardStack(resp.state.players[0]!, 'D020_TurnwrestPlow')
    expect(stack.length).toBeLessThanOrEqual(1)
  })

  it('skip optional plow preserves stack', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })

    // Skip optional
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    const stack = getCardStack(resp.state.players[0]!, 'D020_TurnwrestPlow')
    expect(stack.length).toBe(2)
    expect(resp.state.players[0]!.fields.length).toBe(1)
  })

  it('does not trigger on other action spaces', () => {
    const session = setup()

    // Use grain-seeds instead
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    // No choice offered from card (grain-seeds may have its own choices though)
    // Stack should be unchanged
    const stack = getCardStack(resp.state.players[0]!, 'D020_TurnwrestPlow')
    expect(stack.length).toBe(2)
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, finish, next, take, hand, buy, noSource, plow, accept, advanceOwner, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D020 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'D020_TurnwrestPlow', s = minorSetup(card, 3, 2, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(getCardStack(r.state.players[0]!, card).length, 2)
    save('D020-N1-legal', r)
    {
      const t = minorSetup(card, 2, 2, 20, 14)
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
      save('D020-N1-resource', q)
    }
    {
      const t = minorSetup(card, 3, 1, 20, 14)
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
      save('D020-N1-prerequisite', q)
    }
  })
  it('D020 N2 real onBuy stock permits two additional fields on either printed action and never a third', () => {
    for (const space of ['farmland', 'cultivation']) {
      const card = 'D020_TurnwrestPlow', s = minorSetup(card, 3, 2)
      advanceOwner(s, buy(s, card))
      const r = finish(s, take(s, space), true)
      assert.equal(r.state.players[0]!.fields.length, 3)
      assert.equal(getCardStack(r.state.players[0]!, card).length, 0)
      save(`D020-N2-${space}`, r)
    }
  })
  it('D020 N3 decline retains both fields while hand-only and opponent cannot use stock', () => { const card = 'D020_TurnwrestPlow', s = minorSetup(card, 3, 2); advanceOwner(s, buy(s, card)); let r = finish(s, take(s, 'farmland')); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(getCardStack(r.state.players[0]!, card).length, 2); save('D020-N3-decline', r); const t = setup(card, 14, st => hand(st, card)); r = take(t, 'farmland'); noSource(r, card); r = finish(t, r, true); assert.equal(r.state.players[0]!.fields.length, 1); save('D020-N3-hand', r); const u = minorSetup(card, 3, 2); finish(u, buy(u, card)); next(u); r = take(u, 'farmland'); noSource(r, card); r = finish(u, r, true); assert.equal(r.state.players[1]!.fields.length, 1); assert.equal(getCardStack(r.state.players[0]!, card).length, 2); save('D020-N3-opponent', r); const v = minorSetup(card, 3, 2); advanceOwner(v, buy(v, card)); let partial = plow(v, take(v, 'farmland')); partial = plow(v, accept(v, partial, card)); partial = finish(v, partial); assert.equal(partial.state.players[0]!.fields.length, 2); assert.equal(getCardStack(partial.state.players[0]!, card).length, 1); save('D020-N3-one', partial); })
})
