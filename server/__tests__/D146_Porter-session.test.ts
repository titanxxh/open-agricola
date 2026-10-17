import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { D146_Porter_impl } from '../../shared/cards/D/D146_Porter'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/D/D146_Porter'
import assert from 'node:assert/strict'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

const CARD_ID = 'D146_Porter'
const LISTENER = D146_Porter_impl.listeners[0]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { clay: 4 },
  from: { kind: 'actionSpace', spaceId: 'clay-pit' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

describe('D146_Porter session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const directContext = (
    transactionEvents: DraftGameEvent<'resource.moved'>[],
  ): { session: GameSession; context: CardListenerContext } => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.id = 'p1'
    player.occupationPlayed.push(CARD_ID)
    return { session, context: {
    actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find((space) => space.id === 'clay-pit')!,
      actionId: 'collect',
      phase: 'after',
      transactionEvents,
      actionEvents: transactionEvents,
      result: { type: 'ok', resourcesGained: { clay: 4 } },
    } as unknown as CardListenerContext }
  }

  it('gains 1 clay + 1 food when collecting 4+ clay from clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 4
    session.loadState(state)

    const clayBefore = session.getState().state.players[0]!.resources.clay
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const after = session.getState().state
    // +4 clay from space, +1 clay + 1 food from Porter
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 4 + 1)
    expect(after.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('gains 1 wood + 1 food when collecting 4+ wood from forest', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 4
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const after = session.getState().state
    // +4 wood from space, +1 wood + 1 food from Porter
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 4 + 1)
    expect(after.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger when collecting less than 4 building resources', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 3
    session.loadState(state)

    const clayBefore = session.getState().state.players[0]!.resources.clay
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +3 clay from space, no porter bonus
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 3)
    expect(after.players[0]!.resources.food).toBe(foodBefore)
  })

  it('does not trigger for non-building resources (e.g. sheep)', () => {
    const session = setup()
    const state = session.getState().state
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 4
    session.loadState(state)

    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)

    // Handle animalReorg for sheep
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 4 },
      ])
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // No porter bonus — sheep is not a building resource
    expect(after.players[0]!.resources.food).toBe(foodBefore)
  })

  it('uses action-space building resource events even without result gains', () => {
    const { session: ruleSession1, context: ctx } = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = ruleSession1.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { clay: 1, food: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger for supply/cardEffect clay even when result reports clay', () => {
    const { session: ruleSession2, context: ctx } = directContext([moved({
      from: { kind: 'supply' },
      reason: 'cardEffect',
    })])

    const result = ruleSession2.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result).toBeUndefined()
  })
})

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, next, take, move } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D146 N1 actual accumulation thresholds distinguish same goods and wood food exclusions', () => {
    for (const key of ['wood', 'clay', 'reed', 'stone', 'food'] as const)
      for (const n of [3, 4, 5]) {
        const space = {wood:'forest',clay:'clay-pit',reed:'reed-bank',stone:'western-quarry',food:'fishing'}[key]
        const s = setup('D146_Porter', 14, state => { const a = state.actionSpaces.find(a => a.id === space)!; a.resources = { ...a.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, [key]: n }; })
        const r = finish(s, take(s, space))
        const p = r.state.players[0]!
        const qualifies = key !== 'food' && n >= 4
        for (const k of ['wood', 'clay', 'reed', 'stone', 'food'] as const)
          assert.equal(p.resources[k], (k === 'food' ? 20 : 0) + (k === key ? n : 0) + (qualifies ? (k === key || k === 'food' ? 1 : 0) : 0))
        save(`D146-N1-${key}-${n}`, r)
      }
  })
  it('D146 N2 mixed short goods opponent collection and hand-only card exclude bonus', () => {
    for (const mode of ['mixed', 'opponent', 'hand']) {
      const space = mode==='mixed'?'forest':'clay-pit'
      const s = setup('D146_Porter', 14, state => {
        const a = state.actionSpaces.find(a => a.id === space)!
        a.resources = { ...a.resources, wood: 0, clay: mode === 'mixed' ? 2 : 4, reed: mode === 'mixed' ? 1 : 0, stone: 0, food: 0 }
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['D146_Porter']
        }
      })
      if (mode === 'opponent') {
        move(s, 'grain-seeds')
        next(s)
      }
      const r = finish(s, ok(s.takeAction(mode === 'opponent' ? 1 : 0, space)))
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.food, 20)
      save(`D146-N2-${mode}`, r)
    }
  })
})
