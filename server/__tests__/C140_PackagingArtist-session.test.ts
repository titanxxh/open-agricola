import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C140_PackagingArtist'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

const CARD_ID = 'C140_PackagingArtist'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setupMajorImprovementAffordable = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const p1 = state.players[0]!
  setWorkersAtHome(state, p1, 2)
  p1.occupationPlayed = [CARD_ID]
  // Major_Basket cost: 2 reed + 2 stone (mirrors A143_Stonecutter-session.test.ts pattern).
  p1.resources = {
    ...p1.resources,
    grain: 0, food: 0, wood: 0, clay: 0, reed: 2, stone: 2,
  }
  if (!state.availableMajorImprovements.includes('Major_Basket')) {
    state.availableMajorImprovements.push('Major_Basket')
  }
  p1.minorHand = ['__test_placeholder__']
  p1.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

const setupMajorImprovementWithBakeProvider = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const p1 = state.players[0]!
  setWorkersAtHome(state, p1, 2)
  p1.occupationPlayed = [CARD_ID]
  p1.improvements = [...(p1.improvements ?? []), 'Major_Fireplace1']
  p1.resources = {
    ...p1.resources,
    grain: 1, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  }
  p1.minorHand = ['__test_placeholder__']
  p1.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

describe('C140_PackagingArtist session', () => {
  it('onBuy grants 1 grain', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, state.players[0]!))
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ grain: 1 })
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).sourceCard).toBe(CARD_ID)
  })

  // Rule: computeReplaceImprovement returns bakeBreadNode — minor-improvement
  // action is REPLACED by bake-bread (not "alongside"). Implementation uses a
  // computeReplace listener with `decline + alternativeFlow: bake-bread leaf`.
  it('computeReplace replaces minor-improvement with bake-bread (decline + alternativeFlow)', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect(result!.decline).toBe(true)
    const leaf = result!.alternativeFlow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('computeReplace is silent when trueAction=false', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
      trueAction: false,
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  // Rule: onPlayerIsDoable forces minor-improvement to be doable when player
  // has any "real" minor action context (the card replaces it with bake-bread,
  // which is always doable as long as the player can bake — the listener
  // returns `doable: true` so the underlying minor-improvement action stays
  // enabled even if the player has no minor cards in hand).
  it('isDoable: minor-improvement stays doable even with no minor cards', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = [] // no minor cards
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext))
    expect(result?.doable).toBe(true)
  })

  it('isDoable is silent when trueAction=false', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = []
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'isDoable',
      doable: false,
      trueAction: false,
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('isDoable: keeps doable=true unchanged when already doable', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'isDoable',
      doable: true,
    } as unknown as CardListenerContext))
    // No-op when already doable (don't override true with anything)
    expect(result === undefined || result.doable === true).toBe(true)
  })

  it('computeReplace fires on improvement-any too (Major Improvement space)', () => {


    // Registration shape: listener must be registered on unified 'improvement'.


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('improvement')
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect(result!.decline).toBe(true)
    const leaf = result!.alternativeFlow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('bake-bread')
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('isDoable forces doable=true on improvement-any when not doable', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('improvement')
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext))
    expect(result?.doable).toBe(true)
  })

  it('computeReplace bails out on re-entry (checkedReplaceAction guard, both action IDs)', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-replace-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    for (const actionId of ['improvement']) {
      const result = session.withCtx(() => executeCardListener(listener!, {
        state,
        player,
        actionId,
        phase: 'computeReplace',
        actionContext: { checkedReplaceAction: true },
      } as unknown as CardListenerContext))
      expect(result).toBeUndefined()
    }
  })

  it('session: Major Improvement space inserts a C140 bake-bread XOR alternative', () => {
    const session = setupMajorImprovementWithBakeProvider()
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const options = resp.interaction.request.options ?? []
    const bakeAlternative = options.find((o) => o.sourceCard === CARD_ID)
    expect(bakeAlternative).toBeDefined()
    expect(bakeAlternative!.labelKey).toBe('actions.bake-bread.name')
    // The XOR should also still expose the original improvement-any branch (no C140 sourceCard).
    expect(options.some((o) => o.sourceCard !== CARD_ID)).toBe(true)
  })

  it('session: choosing bake-bread alternative converts 1 grain to 2 food via Fireplace1', () => {
    const session = setupMajorImprovementWithBakeProvider()
    const resp1 = session.takeAction(0, 'major-improvement')
    expect(resp1.interaction.stateId).toBe('wait')
    if (resp1.interaction.stateId !== 'wait') return

    const bake = resp1.interaction.request.options?.find((o) => o.sourceCard === CARD_ID)
    expect(bake).toBeDefined()
    const resp2 = session.resolveChoice(0, bake!.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.interaction.stateId).toBe('wait')
    if (resp2.interaction.stateId !== 'wait') return

    // bake-bread pending exposes Fireplace1 rate option.
    const rateOpt = resp2.interaction.request.options?.find((o) => o.value === 'Major_Fireplace1')
    expect(rateOpt).toBeDefined()
    const resp3 = session.resolveChoice(0, rateOpt!.value)
    expect(resp3.ok).toBe(true)

    // grain=1 → auto-resolves count=1; final state has grain 0 / food 2.
    const p1 = resp3.state.players[0]!
    expect(p1.resources.grain).toBe(0)
    expect(p1.resources.food).toBe(2)
  })

  it('isDoable bails out on re-entry (checkedReplaceAction guard, both action IDs)', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C140-packaging-artist-isdoable-minor-improvement')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    for (const actionId of ['improvement']) {
      const result = session.withCtx(() => executeCardListener(listener!, {
        state,
        player,
        actionId,
        phase: 'isDoable',
        doable: false,
        actionContext: { checkedReplaceAction: true },
      } as unknown as CardListenerContext))
      expect(result).toBeUndefined()
    }
  })

  it('session: original major-improvement branch resolves without infinite C140 XOR re-entry', () => {
    // When the player has no grain, C140's bake-bread alternative is structurally
    // infeasible. The XOR auto-resolves to the original improvement-any branch.
    // If the `checkedReplaceAction` guard were missing, the engine would re-fire
    // C140's computeReplace on the original leaf (which is marked
    // `checkedReplaceAction: true`) and infinitely insert XOR layers — the
    // single `takeAction` call would never settle. With the guard, the action
    // completes cleanly to `confirm-next-player`.
    const session = setupMajorImprovementAffordable()
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    // Action settled to the next-player confirmation, not stuck in a C140 loop.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.spaceId).toBe('__subflow:confirm-next-player')

    const p1 = resp.state.players[0]!
    expect(p1.improvements).toContain('Major_Basket')
    expect(p1.resources.reed).toBe(0)
    expect(p1.resources.stone).toBe(0)
  })
})

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, lesson, resources, improvement, bake } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C140 N1 actual first Lessons grants exactly one grain', () => { const s = make('C140_PackagingArtist', undefined, false), r = finish(s, lesson(s, 'C140_PackagingArtist'), false); resources(r, { grain: 1, food: 100 }); save('C140-N1', r) })
  it('C140 N2 Meeting Place and Major Improvement can replace improvement with a real one-grain Fireplace bake', () => { for (const space of ['meeting-place', 'major-improvement']) { const s = make('C140_PackagingArtist', st => { st.players[0]!.resources.grain = 1; st.players[0]!.improvements = ['Major_Fireplace1']; st.availableMajorImprovements = [] }), p = ok(s.takeAction(0, space)), r = bake(s, p); resources(r, { grain: 0, food: 102 }); assert.deepEqual(r.state.players[0]!.minorPlayed, []); save(`C140-N2-${space}`, { p, r }) } })
  it('C140 N3 original paid minor branch remains usable and nonimprovement or unplayed card cannot bake', () => { const s = make('C140_PackagingArtist', st => { st.players[0]!.resources.clay = 1; st.players[0]!.minorHand = ['A050_MilkJug'] }), r = finish(s, improvement(s, 'A050_MilkJug'), false); resources(r, { clay: 0, grain: 0, food: 100 }); assert.ok(r.state.players[0]!.minorPlayed.includes('A050_MilkJug')); const c = make('C140_PackagingArtist'), cr = finish(c, ok(c.takeAction(0, 'grain-seeds')), false); resources(cr, { grain: 1, food: 100 }); const a = make('C140_PackagingArtist', st => { st.players[0]!.resources.grain = 1; st.players[0]!.improvements = ['Major_Fireplace1'] }, false), ar = finish(a, ok(a.takeAction(0, 'meeting-place')), false); resources(ar, { grain: 1, food: 100 }); save('C140-N3', { r, cr, ar }) })
})
