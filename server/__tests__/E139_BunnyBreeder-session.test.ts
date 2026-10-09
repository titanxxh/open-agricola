import { describe, expect, it } from 'vitest'
import { E139_BunnyBreeder_impl } from '../../shared/cards/E/E139_BunnyBreeder'
import { GameSession } from '../game/authoritative-session'

const CARD_ID = 'E139_BunnyBreeder'

describe('E139 Bunny Breeder — onBuy XOR optional + futureMeeples', () => {
  it('round 1: returns XOR optional with 13 children (one per future round)', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 1
    const player = state.players[0]!

    const flow = E139_BunnyBreeder_impl.effect.onBuy?.(state, player)
    expect(flow).toBeTruthy()
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(13)
  })

  it('round 5: returns XOR optional with 9 children', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!

    const flow = E139_BunnyBreeder_impl.effect.onBuy?.(state, player)
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.children).toHaveLength(9)
  })

  it('round 14: no XOR (turnsLeft = 0)', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 14
    const player = state.players[0]!

    const flow = E139_BunnyBreeder_impl.effect.onBuy?.(state, player)
    expect(flow).toBeUndefined()
  })

  it('each child carries an inline future-meeple request: i food at round = current+i', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 3
    const player = state.players[0]!

    const flow = E139_BunnyBreeder_impl.effect.onBuy?.(state, player)
    if (flow?.type !== 'xor') throw new Error('expected xor')

    flow.children.forEach((child, idx) => {
      const i = idx + 1
      expect(child.type).toBe('leaf')
      if (child.type !== 'leaf') return
      expect(child.actionId).toBe('future-meeples')
      const req = (child.params as { __futureMeepleRequest?: unknown } | undefined)
        ?.__futureMeepleRequest as
        | { cardId: string; playerId: string; entries: { round: number; resources: { food: number } }[] }
        | undefined
      expect(req).toBeTruthy()
      expect(req?.cardId).toBe(CARD_ID)
      expect(req?.playerId).toBe(player.id)
      expect(req?.entries).toHaveLength(1)
      expect(req?.entries[0]!.round).toBe(state.round + i)
      expect(req?.entries[0]!.resources.food).toBe(i)
    })
  })

  it('round 13: single child for round 14, +1 food', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 13
    const player = state.players[0]!

    const flow = E139_BunnyBreeder_impl.effect.onBuy?.(state, player)
    if (flow?.type !== 'xor') throw new Error('expected xor')
    expect(flow.children).toHaveLength(1)
    const child = flow.children[0]!
    if (child.type !== 'leaf') throw new Error('expected leaf')
    const req = (child.params as { __futureMeepleRequest?: unknown } | undefined)
      ?.__futureMeepleRequest as { entries: { round: number; resources: { food: number } }[] }
    expect(req.entries[0]!.round).toBe(14)
    expect(req.entries[0]!.resources.food).toBe(1)
  })
})
