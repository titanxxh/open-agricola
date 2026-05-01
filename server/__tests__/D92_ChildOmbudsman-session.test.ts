import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D92_ChildOmbudsman_impl } from '../../shared/cards/D/D92_ChildOmbudsman'
import {
  setActiveWorkerCount,
  setNewbornCount,
} from '../../shared/game/player'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

const CARD_ID = 'D92_ChildOmbudsman'

const makeCtx = (round: number, rooms: number, family: number) => {
  const session = new GameSession()
  const state = session.getState().state
  state.round = round
  const player = state.players[0]!
  player.rooms = rooms
  player.occupationPlayed.push(CARD_ID)
  setActiveWorkerCount(player, family)
  setNewbornCount(player, 0)
  return { state, player }
}

describe('D92 Child Ombudsman — listener', () => {
  it('does not offer SEQ in round 4 (round < 5)', () => {
    const { state, player } = makeCtx(4, 3, 2)
    const handler = D92_ChildOmbudsman_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('does not offer SEQ when no free room (rooms === familySize)', () => {
    const { state, player } = makeCtx(5, 2, 2)
    const handler = D92_ChildOmbudsman_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('offers SEQ optional with [special-effect, family-growth] in round 5 with free room', () => {
    const { state, player } = makeCtx(5, 3, 2)
    const handler = D92_ChildOmbudsman_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = handler(ctx) as ActionHookResult | undefined
    expect(result).toBeTruthy()
    expect(result?.sourceCard).toBe(CARD_ID)
    const flow = result?.flow as {
      type: 'seq'
      optional?: boolean
      children: { type: string; actionId?: string; sourceCard?: string; params?: { kind?: string; key?: string; amount?: number } }[]
    } | undefined
    expect(flow?.type).toBe('seq')
    expect(flow?.optional).toBe(true)
    expect(flow?.children).toHaveLength(2)
    // First child mutates negativeScore via special-effect leaf (no direct
    // writeCardExtraData inside the handler).
    expect(flow?.children[0]!.actionId).toBe('special-effect')
    expect(flow?.children[0]!.sourceCard).toBe(CARD_ID)
    expect(flow?.children[0]!.params?.kind).toBe('increment-extra-data')
    expect(flow?.children[0]!.params?.key).toBe('negativeScore')
    expect(flow?.children[0]!.params?.amount).toBe(2)
    // Second child performs the free family-growth.
    expect(flow?.children[1]!.actionId).toBe('family-growth')
    expect(flow?.children[1]!.sourceCard).toBe(CARD_ID)
  })

  it('listener handler does NOT mutate negativeScore directly (engine-mediated)', () => {
    const { state, player } = makeCtx(5, 3, 2)
    const handler = D92_ChildOmbudsman_impl.listeners[0]!.handler
    const before = readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0
    handler({
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext)
    const after = readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0
    expect(after).toBe(before) // unchanged: mutation only happens via special-effect leaf
  })

  it('computeBonusScore: returns -negativeScore (post-mutation total)', () => {
    const { state, player } = makeCtx(5, 3, 2)
    writeCardExtraData(player, CARD_ID, 'negativeScore', 6)
    const compute = D92_ChildOmbudsman_impl.effect.computeBonusScore!
    expect(compute(state, player)).toBe(-6)
  })

  it('computeBonusScore: 0 when no mutation has happened', () => {
    const { state, player } = makeCtx(5, 3, 2)
    const compute = D92_ChildOmbudsman_impl.effect.computeBonusScore!
    expect(Math.abs(compute(state, player))).toBe(0)
  })
})
