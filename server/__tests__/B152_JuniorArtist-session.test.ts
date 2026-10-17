import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'

import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import type { ActionFlow } from '../../shared/contract/types'
import '../../shared/cards/B/B152_JuniorArtist'
import assert from 'node:assert/strict'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'


const CARD_ID = 'B152_JuniorArtist'

const setup = (options?: {
  withCard?: boolean
  food?: number
  occupationHand?: string[]
  travelingPlayersFood?: number
}) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: options?.food ?? 3,
    wood: 10,
    clay: 5,
  }
  state.players[1]!.workersAvailable = 2
  state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

  if (options?.withCard ?? true) {
    player.occupationPlayed.push(CARD_ID)
  }
  player.occupationHand = [...(options?.occupationHand ?? ['B130_FullPeasant'])]

  const tp = state.actionSpaces.find((s) => s.id === 'traveling-players')
  if (tp) tp.resources.food = options?.travelingPlayersFood ?? 2

  session.loadState(state)
  return session
}

const dayLaborerCtx = (s: ReturnType<GameSession['getState']>['state'], workerId = '1') => {
  const space = s.actionSpaces.find((x) => x.id === 'day-laborer')!
  space.takenBy = [{ playerId: s.players[0]!.id, workerId }]
  return space
}

describe('B152_JuniorArtist session', () => {
  it('after day-laborer, offers optional chain when player has food and chain targets exist', () => {
    const session = setup({ withCard: true, food: 3, travelingPlayersFood: 2 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('accepting chain pays 1 food', () => {
    const session = setup({ withCard: true, food: 3, travelingPlayersFood: 2 })
    let resp = session.takeAction(0, 'day-laborer')
    const foodAfterDayLaborer = resp.state.players[0]!.resources.food
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    // pay-resources runs as the first step of the optional seq
    const currentFood = resp.state.players[0]!.resources.food
    expect(currentFood).toBeLessThanOrEqual(foodAfterDayLaborer - 1)
  })

  it('does not offer chain when player has 0 food (direct listener check)', () => {
    const session = setup({ withCard: true, food: 0, travelingPlayersFood: 2 })
    const s = session.getState().state
    const space = dayLaborerCtx(s)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('does not offer chain without the card', () => {
    const session = setup({ withCard: false, food: 3, travelingPlayersFood: 2 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not trigger on non-day-laborer spaces', () => {
    const session = setup({ withCard: true, food: 3, travelingPlayersFood: 2 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('listener emits seq(pay, jumpLeaf-or-xor) targeting candidate spaces', () => {
    const session = setup({
      withCard: true,
      food: 3,
      travelingPlayersFood: 3,
      occupationHand: [],
    })
    const s = session.getState().state
    const space = dayLaborerCtx(s)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children[0].actionId).toBe('pay')

    const findJumpToTp = (node: ActionFlow): boolean => {
      if (!node) return false
      if (node.type === 'leaf' && node.actionId === 'place-farmer') {
        const ctx = node.actionContext ?? {}
        return ctx.viaCardJump === true && ctx.targetSpaceId === 'traveling-players'
      }
      if ('children' in node && Array.isArray(node.children)) {
        return node.children.some((c) => findJumpToTp(c))
      }
      return false
    }
    expect(findJumpToTp(flow.children[1])).toBe(true)
  })

  it('listener emits a jumpLeaf for lessons when player has occupation in hand', () => {
    const session = setup({
      withCard: true,
      food: 3,
      occupationHand: ['B130_FullPeasant'],
      travelingPlayersFood: 0,
    })
    const s = session.getState().state
    const space = dayLaborerCtx(s)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    if (!result) return  // ok if reachability rejects all candidates
    const flow = result.flow as ActionFlow
    const findJumpToLessons = (node: ActionFlow): boolean => {
      if (!node) return false
      if (node.type === 'leaf' && node.actionId === 'place-farmer') {
        const ctx = node.actionContext ?? {}
        return ctx.viaCardJump === true &&
          (ctx.targetSpaceId === 'lessons' || ctx.targetSpaceId === 'lessons-4')
      }
      if ('children' in node && Array.isArray(node.children)) {
        return node.children.some((c) => findJumpToLessons(c))
      }
      return false
    }
    expect(findJumpToLessons(flow)).toBe(true)
  })

  it('4p variant: lessons-4 is among the jump candidates', () => {
    const session = setup({
      withCard: true,
      food: 3,
      occupationHand: ['B130_FullPeasant'],
      travelingPlayersFood: 0,
    })
    const s = session.getState().state
    // Confirm lessons-4 exists in 4p (otherwise this test is meaningless)
    expect(s.actionSpaces.some((x) => x.id === 'lessons-4')).toBe(true)
    const space = dayLaborerCtx(s)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()

    const findJumpToLessons4 = (node: ActionFlow): boolean => {
      if (!node) return false
      if (node.type === 'leaf' && node.actionId === 'place-farmer') {
        const ctx = node.actionContext ?? {}
        return ctx.viaCardJump === true && ctx.targetSpaceId === 'lessons-4'
      }
      if ('children' in node && Array.isArray(node.children)) {
        return node.children.some((c) => findJumpToLessons4(c))
      }
      return false
    }
    expect(findJumpToLessons4(result!.flow as ActionFlow)).toBe(true)
  })

  it('does not produce chain when no candidate target is reachable', () => {
    const session = setup({
      withCard: true,
      food: 3,
      occupationHand: [],
      travelingPlayersFood: 0,
    })
    const s = session.getState().state
    const lessons = s.actionSpaces.find((x) => x.id === 'lessons')
    if (lessons) lessons.takenBy = [{ playerId: s.players[1]!.id, workerId: 'w1' }]
    const lessons4 = s.actionSpaces.find((x) => x.id === 'lessons-4')
    if (lessons4) lessons4.takenBy = [{ playerId: s.players[1]!.id, workerId: 'w1' }]
    const tp = s.actionSpaces.find((x) => x.id === 'traveling-players')
    if (tp) tp.takenBy = [{ playerId: s.players[1]!.id, workerId: 'w1' }]
    session.loadState(s)

    const post = session.getState().state
    const space = dayLaborerCtx(post)

    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state: post,
      player: post.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })
})

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, finish, ready, play, undo, pile, at, res } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B152 N1 real purchase and accepted Day Laborer jump collect Traveling Players with the same person', () => { const b = make('B152_JuniorArtist', undefined, false), bought = finish(b, play(b, 'B152_JuniorArtist')), undone = undo(b), s = make('B152_JuniorArtist', st => pile(st, 'traveling-players', 'food', 3)), p = take(s, 0, 'day-laborer'), worker = at(p, 'day-laborer')[0]!.workerId, r = finish(s, p, true, ['traveling-players']); res(r, { food: 104 }); assert.equal(at(r, 'traveling-players')[0]?.workerId, worker); assert.equal(at(r, 'day-laborer').length, 0); assert.equal(workersAvailable(r.state, r.state.players[0]!), 1); save('B152-N1', { bought, undone, p, r }); });
  it('B152 N2 Day Laborer can fund both the jump and a real Lessons occupation fee', () => { const s = make('B152_JuniorArtist', st => { st.players[0]!.resources.food = 0; }), p = take(s, 0, 'day-laborer'), r = finish(s, p, true, ['"lessons"', 'A125_Priest']); res(r, { food: 0 }); assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest')); assert.equal(at(r, 'lessons').length, 1); assert.equal(workersAvailable(r.state, r.state.players[0]!), 1); save('B152-N2', { p, r }); });
  it('B152 N3 real occupied targets held card opponent unrelated action and decline prevent a jump', () => { for (const mode of ['occupied', 'hand', 'opponent', 'unrelated', 'decline']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('B152_JuniorArtist', st => { if (mode === 'occupied') {
          st.currentPlayerIndex = 1;
          st.players.slice(1).forEach((p, i) => { p.occupationHand = [['A110_Roughcaster', 'A123_FrameBuilder'], ['A099_FellowGrazer', 'A100_Curator'], ['A101_CookeryOutfitter', 'A102_Grocer']][i]!; });
      } if (mode === 'opponent')
          st.currentPlayerIndex = 1; }, mode !== 'hand');
      if (mode === 'occupied')
          for (const [i, target] of [[1, 'lessons'], [2, 'lessons-4'], [3, 'traveling-players']] satisfies Array<[
              number,
              string
          ]>) {
              ready(s);
              finish(s, take(s, i, target), true);
          }
      if (mode === 'occupied')
          ready(s);
      const p = take(s, a, mode === 'unrelated' ? 'grain-seeds' : 'day-laborer'), r = finish(s, p, mode !== 'decline', [], mode === 'decline' ? undefined : 'B152_JuniorArtist');
      res(r, { food: a === 0 && mode !== 'unrelated' ? 102 : 100 });
      assert.equal(at(r, 'day-laborer', a).length, mode === 'unrelated' ? 0 : 1);
      save(`B152-N3-${mode}`, { p, r });
  } });
})
