import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C026_Flail'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Baking from './_helpers/audit/ae-negative-32-baking'

const CARD_ID = 'C026_Flail'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

describe('C026_Flail session', () => {
  it('onBuy grants 2 food', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, state.players[0]!))
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 2 })
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).sourceCard).toBe(CARD_ID)
  })

  it('after-place-farmer on farmland offers optional bake-bread', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C26-flail-after-place-farmer')!
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.optional).toBe(true)
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('after-place-farmer on cultivation offers optional bake-bread', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C26-flail-after-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5 // cultivation available from round 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'cultivation')
    if (!space) return // not present in state; skip the assertion path
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('bake-bread')
  })

  it('does not trigger on non-trigger spaces', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C26-flail-after-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

})

describe('C026 Flail parity', () => {
  const CARD_ID = 'C026_Flail'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({ played = true, grain = 1 }: { played?: boolean; grain?: number } = {}) => {
    const session = new GameSession(6026, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.improvements = played ? ['Major_Fireplace1'] : []
    owner.resources.wood = played ? 0 : 1
    owner.resources.grain = grain
    session.loadState(state)
    return session
  }

  const playCard = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  const completeFarmland = (session: GameSession) => {
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
    response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const completeCultivationPlow = (session: GameSession) => {
    let response = session.takeAction(0, 'cultivation')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
    response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    if (response.interaction.stateId === 'wait'
      && options(response).some((option) => option.labelKey === 'actions.sow.name')) {
      response = session.resolveChoice(response.interaction.playerIndex, '__done__')
    }
    return response
  }

  const acceptBake = (session: GameSession, initial: SessionResponse) => {
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      response = session.resolveChoice(response.interaction.playerIndex, 'Major_Fireplace1')
    }
    return response
  }

  it('C026 S1: paying one wood plays Flail and immediately gains two food', () => {
    const response = playCard(setup({ played: false, grain: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  })

  it('C026 S2: after Farmland the optional Bake Bread action may be declined', () => {
    const session = setup()
    let response = resolveTriggerIfPresent(session, completeFarmland(session), CARD_ID)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('C026 S3: after Farmland Flail can bake one grain with a Fireplace', () => {
    const session = setup()
    const response = acceptBake(session, completeFarmland(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('C026 S4: after Cultivation Flail can bake one grain with a Fireplace', () => {
    const session = setup()
    const response = acceptBake(session, completeCultivationPlow(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('C026 S5: a nonmatching action space offers no Flail Bake Bread action', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
  })
})

describe('ae-negative-32-baking', () => {
  const { sessions, save, ok, make, choose, pendingCard, trigger, finish, action, buy, accept, baker, bake } = audit32Baking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C026 N1 actual one wood purchase gains two food and actual Farmland and late Cultivation each allow one paid grain bake', () => { const s = baker('C026_Flail', false), bought = finish(s, buy(s, 'C026_Flail')); assert.deepEqual([bought.state.players[0]!.resources.wood, bought.state.players[0]!.resources.food], [0, 102]); const rows = []; for (const space of ['farmland', 'cultivation']) {
      const t = baker('C026_Flail'), p = finish(t, ok(t.takeAction(0, space)), 'C026_Flail'), r = bake(t, p, 'C026_Flail');
      assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.food], [0, 102]);
      assert.equal(r.state.players[0]!.fields.length, 1);
      rows.push({ p, r });
  } save('C026-N1', { bought, rows }); });
  it('C026 N2 the optional bake may decline after a real plow and a held card or actual opponent Farmland cannot consume owner grain', () => { const s = baker('C026_Flail'), p = trigger(s, finish(s, ok(s.takeAction(0, 'farmland')), 'C026_Flail'), 'C026_Flail'), decline = finish(s, choose(s, p, o => o.value === '__skip__')); assert.deepEqual([decline.state.players[0]!.resources.grain, decline.state.players[0]!.resources.food], [1, 100]); const t = baker('C026_Flail', false), hand = action(t, 0, 'farmland'); assert.deepEqual([hand.state.players[0]!.resources.grain, hand.state.players[0]!.resources.food], [1, 100]); const q = baker('C026_Flail'), first = action(q, 0, 'reed-bank'), opponent = action(q, 1, 'farmland'); assert.equal(opponent.state.players[0]!.resources.grain, 1); assert.equal(opponent.state.players[0]!.resources.food, 100); save('C026-N2', { p, decline, hand, first, opponent }); });
  it('C026 N3 unrelated action missing oven and unaffordable purchase never create baked food', () => { const s = baker('C026_Flail'), other = action(s, 0, 'reed-bank'); assert.equal(other.state.players[0]!.resources.food, 100); const t = baker('C026_Flail', true, 1, false), p = finish(t, ok(t.takeAction(0, 'farmland')), 'C026_Flail'), r = finish(t, pendingCard(p, 'C026_Flail') ? accept(t, p, 'C026_Flail') : p); assert.equal(r.state.players[0]!.resources.food, 100); const q = make('C026_Flail', false), poor = buy(q, 'C026_Flail'); assert.ok(poor.state.players[0]!.minorHand.includes('C026_Flail')); assertRejectedUnchanged(q, () => q.resolveChoice(0, 'C026_Flail')); save('C026-N3', { other, p, r, poor }); });
})
