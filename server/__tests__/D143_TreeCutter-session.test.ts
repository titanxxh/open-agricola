import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { D143_TreeCutter_impl } from '../../shared/cards/D/D143_TreeCutter'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/D/D143_TreeCutter'
import assert from 'node:assert/strict'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

const CARD_ID = 'D143_TreeCutter'
const LISTENER = D143_TreeCutter_impl.listeners[0]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { clay: 3 },
  from: { kind: 'actionSpace', spaceId: 'clay-pit' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

describe('D143_TreeCutter session', () => {
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
      result: { type: 'ok', resourcesGained: { clay: 3 } },
    } as unknown as CardListenerContext }
  }

  it('gains 1 wood when collecting 3+ clay from clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    // Stack up clay-pit to have 3+ clay
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 3
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +3 clay from clay-pit, +1 wood from TreeCutter
    expect(after.players[0]!.resources.clay).toBeGreaterThanOrEqual(3)
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 1)
  })

  it('does not trigger when collecting wood (excluded resource)', () => {
    const session = setup()
    const state = session.getState().state
    // Forest accumulates wood — excluded by TreeCutter
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 3
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Gained 3 wood from forest but NO extra 1 wood from TreeCutter (wood is excluded)
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 3)
  })

  it('does not trigger when collecting less than 3 of any non-wood resource', () => {
    const session = setup()
    const state = session.getState().state
    // clay-pit with only 2 clay
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 2
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // No bonus wood — only 2 clay collected
    expect(after.players[0]!.resources.wood).toBe(woodBefore)
  })

  it('triggers when collecting 3+ reed from reed-bank', () => {
    const session = setup()
    const state = session.getState().state
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 3
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 1)
  })

  it('uses action-space non-wood events even without result gains', () => {
    const { session: ruleSession1, context: ctx } = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = ruleSession1.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { wood: 1 },
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
  it('D143 N1 actual accumulation thresholds distinguish same goods and wood food exclusions', () => {
    for (const key of ['wood', 'clay', 'reed', 'stone', 'food'] as const)
      for (const n of [2, 3, 4]) {
        const space = {wood:'forest',clay:'clay-pit',reed:'reed-bank',stone:'western-quarry',food:'fishing'}[key]
        const s = setup('D143_TreeCutter', 14, state => { const a = state.actionSpaces.find(a => a.id === space)!; a.resources = { ...a.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, [key]: n }; })
        const r = finish(s, take(s, space))
        const p = r.state.players[0]!
        const qualifies = key !== 'wood' && n >= 3
        for (const k of ['wood', 'clay', 'reed', 'stone', 'food'] as const)
          assert.equal(p.resources[k], (k === 'food' ? 20 : 0) + (k === key ? n : 0) + (qualifies ? (k === 'wood' ? 1 : 0) : 0))
        save(`D143-N1-${key}-${n}`, r)
      }
  })
  it('D143 N2 mixed short goods opponent collection and hand-only card exclude bonus', () => {
    for (const mode of ['mixed', 'opponent', 'hand']) {
      const space = mode==='mixed'?'forest':'clay-pit'
      const s = setup('D143_TreeCutter', 14, state => {
        const a = state.actionSpaces.find(a => a.id === space)!
        a.resources = { ...a.resources, wood: 0, clay: mode === 'mixed' ? 2 : 3, reed: mode === 'mixed' ? 1 : 0, stone: 0, food: 0 }
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['D143_TreeCutter']
        }
      })
      if (mode === 'opponent') {
        move(s, 'grain-seeds')
        next(s)
      }
      const r = finish(s, ok(s.takeAction(mode === 'opponent' ? 1 : 0, space)))
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.food, 20)
      save(`D143-N2-${mode}`, r)
    }
  })
})
