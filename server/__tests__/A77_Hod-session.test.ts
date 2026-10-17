import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A077_Hod'
import type { ActionFlow } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10Accumulation from './_helpers/audit/ae-negative-10-accumulation'

describe('A077_Hod session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorHand.push('A077_Hod')
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0
    // Give pasture for boar placement
    owner.pastures = [{
      id: 'p1', size: 4,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.pastures = [{
      id: 'p2', size: 4,
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 3, col: 0 }, { row: 3, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    // Ensure pig-market has accumulated resources
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    session.devPlayCard(0, 'A077_Hod')
    return session
  }

  it('onBuy grants 1 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'A077_Hod', 'onBuy'))
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ clay: 1 })
  })

  it('owner gets 2 clay when owner uses pig-market', () => {
    const session = setup(0)
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market gives boar -> animalReorg
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Walk through player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 2)
  })

  it('owner gets 2 clay when opponent uses pig-market', () => {
    const session = setup(1)
    const state = session.getState().state
    const ownerClayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    let resp = session.takeAction(1, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market gives boar -> animalReorg for opponent
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(1, 'confirm', [
        { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(ownerClayBefore + 2)
  })

  it('does not trigger on non-pig-market spaces', () => {
    const session = setup(0)
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})

describe('A077_Hod session', () => {
  const CARD_ID = 'A077_Hod'

  const setup = (currentPlayerIndex = 0, played = true) => {
    const session = new GameSession(6077, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
    owner.occupationHand = ['__test_placeholder__']
    owner.minorPlayed = played ? [CARD_ID] : []
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0
    owner.resources.wood = 1

    owner.pastures = [{
      id: 'p1', size: 4,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    const opponent = state.players[1]!
    opponent.minorHand = ['__test_placeholder__']
    opponent.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, opponent, 2)
    opponent.pastures = [{
      id: 'p2', size: 4,
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 3, col: 0 }, { row: 3, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('A077 S1: paying one wood to play Hod immediately gains one clay', () => {
    const session = setup(0, false)
    let response = session.takeAction(0, 'major-improvement')
    if (response.state.players[0]!.minorHand.includes(CARD_ID) && response.interaction.stateId === 'wait') {
      if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
        const improvement = response.interaction.request.options?.find((option) =>
          option.value.startsWith('action-improvement-'))
        if (improvement) response = session.resolveChoice(0, improvement.value)
      }
      if (response.state.players[0]!.minorHand.includes(CARD_ID) && response.interaction.stateId === 'wait') {
        const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
        expect(card).toBeDefined()
        response = session.resolveChoice(0, card!.value)
      }
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1 })
  })
})

describe('ae-negative-10-accumulation', () => {
  const { HOD, sessions, save, setup, ready, turn, buy, deny, gainCount, market, purchaseUndo } = audit10Accumulation
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A077 N1 live purchase shortage rejects before exact fee control', () => { deny(setup({ played: false }), HOD); const s = setup({ played: false, resources: { wood: 1 } }); const r = buy(s, HOD); assertRejectedUnchanged(s, () => s.resolveChoice(0, HOD)); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(gainCount(r, HOD), 1) })
  it('A077 N2 actual own and opponent Pig Market use rewards only holder', () => { for (const actor of [0, 1]) { const s = setup({ played: false, resources: { wood: 1 } }); buy(s, HOD); if (actor === 0) turn(s, 1, 'forest'); const r = market(s, actor); assert.equal(r.state.players[0]!.resources.clay, 3); assert.equal(r.state.players[1]!.resources.clay, 0); assert.equal(r.state.players[actor]!.resources.boar, 1); assert.equal(r.state.players[actor]!.pastures[0]!.animalCount, 1); assert.equal(gainCount(r, HOD), 2) } })
  it('A077 N3 multiple pigs other markets and in hand distinguish source', () => { const s = setup({ pig: 3 }); const r = market(s); assert.equal(r.state.players[0]!.resources.clay, 2); assert.equal(r.state.players[0]!.resources.boar, 3); assert.equal(gainCount(r, HOD), 1); for (const [space, animal] of [['sheep-market', 'sheep'], ['cattle-market', 'cattle']] satisfies Array<[string, 'sheep' | 'cattle']>) { const c = market(setup(), 0, space, animal); assert.equal(c.state.players[0]!.resources.clay, 0); assert.equal(c.state.players[0]!.resources[animal], 1) } const hand = market(setup({ played: false })); assert.equal(hand.state.players[0]!.resources.clay, 0); assert.equal(hand.state.players[0]!.resources.boar, 1) })
  it('A077 N4 occupied repeat rejects before legal remaining worker control', () => { const s = setup(); market(s); turn(s, 1, 'forest'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'pig-market')); const r = turn(s, 0, 'day-laborer'); assert.equal(r.state.players[0]!.resources.clay, 2); assert.equal(r.state.players[0]!.resources.boar, 1); assert.equal(r.state.players[0]!.resources.food, 42); assert.equal(gainCount(r, HOD), 1) })
  it('A077 N5 actual purchase and both recipient undo restore before replay', () => { const purchase = setup({ played: false, resources: { wood: 1 } }); const purchaseBefore = undoRuleSnapshot(purchase.getState()); buy(purchase, HOD); purchaseUndo(purchase, purchaseBefore); assert.equal(buy(purchase, HOD).state.players[0]!.resources.clay, 1); for (const actor of [0, 1]) { const s = setup({ resources: { clay: 1 } }); if (actor === 1) turn(s, 0, 'forest'); const before = undoRuleSnapshot(ready(s, actor)); market(s, actor); assertUndoRestored(before, s.undoAction()); const r = market(s, actor); assert.equal(r.state.players[0]!.resources.clay, 3); assert.equal(r.state.players[actor]!.resources.boar, 1); assert.equal(gainCount(r, HOD), 1); save('Hod-actual-whole-use-undo-replay', r) } })
})
