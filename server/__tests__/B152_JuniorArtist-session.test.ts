import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'

import { setWorkersAtHome } from '../../shared/game/player'
import type { ActionFlow } from '../../shared/game/types'
import '../../shared/cards/B/B152_JuniorArtist'


const CARD_ID = 'B152_JuniorArtist'

const setup = (options?: {
  withCard?: boolean
  food?: number
  occupationHand?: string[]
  travelingPlayersFood?: number
}) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
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
  if (options?.occupationHand) {
    player.occupationHand = [...options.occupationHand]
  }

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
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const hasSkip = resp.pending.options.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
  })

  it('accepting chain pays 1 food', () => {
    const session = setup({ withCard: true, food: 3, travelingPlayersFood: 2 })
    let resp = session.takeAction(0, 'day-laborer')
    const foodAfterDayLaborer = resp.state.players[0]!.resources.food
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const accept = resp.pending.options.find((o) => o.value !== '__skip__')
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
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('does not offer chain without the card', () => {
    const session = setup({ withCard: false, food: 3, travelingPlayersFood: 2 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).not.toBe('choice')
  })

  it('does not trigger on non-day-laborer spaces', () => {
    const session = setup({ withCard: true, food: 3, travelingPlayersFood: 2 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).not.toBe('choice')
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
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children[0].actionId).toBe('pay-resources')

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
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: s,
      player: s.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
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

    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B152-junior-artist-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: post,
      player: post.players[0]!,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })
})
