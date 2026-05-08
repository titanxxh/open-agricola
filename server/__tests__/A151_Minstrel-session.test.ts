import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/A/A151_Minstrel'

const CARD_ID = 'A151_Minstrel'

describe('A151_Minstrel session — viaCardJump worker-less', () => {
  const setup4P = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    expect(state.players.length).toBe(4)
    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    return { session, state, owner }
  }

  it('returns optional jumpLeaf seq when exactly 1 stage-1 space is unoccupied', () => {
    const { state, owner } = setup4P()

    // Mark only sheep-market unoccupied; occupy other stage-1 spaces.
    const sheep = state.actionSpaces.find((s) => s.id === 'sheep-market')!
    sheep.takenBy = []
    sheep.resources = { ...sheep.resources, sheep: 5 }

    for (const id of ['grain-utilization', 'fencing', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = [{ playerId: 'opponent', workerId: '1' }]
    }

    // roundActionOrder must include all stage-1 ids in positions 0..3 by round 4
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)

    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('place-farmer')
    expect(leaf.expandFlow).toBe(true)
    expect(leaf.actionContext?.viaCardJump).toBe(true)
    expect(leaf.actionContext?.targetSpaceId).toBe('sheep-market')
    expect(leaf.actionContext?.workerId).toBeUndefined()
    expect(leaf.actionContext?.sourceCard).toBe(CARD_ID)
  })

  it('returns null when 0 stage-1 spaces are unoccupied', () => {
    const { state, owner } = setup4P()

    for (const id of ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = [{ playerId: 'opponent', workerId: '1' }]
    }
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns null when 2+ stage-1 spaces are unoccupied', () => {
    const { state, owner } = setup4P()

    for (const id of ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = []
    }
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns null when stage-1 spaces have not opened yet (round before posIndex)', () => {
    const { state, owner } = setup4P()

    const sheep = state.actionSpaces.find((s) => s.id === 'sheep-market')!
    sheep.takenBy = []
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    // sheep-market scheduled for round 5 (posIndex 4) — skip in round 4
    state.roundActionOrder[4] = 'sheep-market'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('jumpLeaf has correct shape for fencing as the unoccupied space', () => {
    const { state, owner } = setup4P()

    const fence = state.actionSpaces.find((s) => s.id === 'fencing')!
    fence.takenBy = []
    for (const id of ['sheep-market', 'grain-utilization', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = [{ playerId: 'opponent', workerId: '1' }]
    }
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('place-farmer')
    expect(leaf.actionContext?.targetSpaceId).toBe('fencing')
    expect(leaf.actionContext?.workerId).toBeUndefined()
  })
})
