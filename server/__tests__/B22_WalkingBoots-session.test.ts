import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/game/player'
import type { ActionFlow } from '../../shared/game/types'

import { B22_WalkingBoots } from '../../shared/cards/B/B22_WalkingBoots'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'B22_WalkingBoots'

describe('B22_WalkingBoots session', () => {
  it('onBuy returns SEQ(gain food:2, place-farmer fromSupply markForRemoval)', () => {
    // BGA `B22_WalkingBoots::onBuy` returns NODE_SEQ with children
    //   gainNode([FOOD => 2])
    //   PLACE_FARMER args { fromSupply: true, source, markForRemoval: true }
    // Our previous implementation truncated to gainLeaf food:2 only.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.children.length).toBeGreaterThanOrEqual(2)

    // First child: gain food 2
    const gainChild = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gainChild.actionId).toBe('gain')
    expect(gainChild.params).toMatchObject({ food: 2 })

    // Second child: place-farmer with fromSupply + markForRemoval
    const placeChild = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(placeChild.actionId).toBe('place-farmer')
    expect(placeChild.actionContext).toBeDefined()
    expect(placeChild.actionContext!.fromSupply).toBe(true)
    expect(placeChild.actionContext!.markForRemoval).toBe(true)
    expect(placeChild.sourceCard).toBe(CARD_ID)
  })

  it('onReturnHome removes the marked worker and clears the flag', () => {
    // After place-farmer fromSupply records markedSpaceId on cardStates,
    // the next return-home phase must remove that worker (deactivate +
    // detach from action space) and clear the flag so it cannot fire twice.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Simulate the post-onBuy state: a 6th active worker was placed on
    // 'forest', and B22 recorded markedSpaceId = 'forest'.
    setWorkersAtHome(state, player, 0)
    // Add a 6th worker beyond the default 5 to mimic the from-supply farmer
    player.workers = [
      ...(player.workers ?? []),
      { id: '6', isActive: true, isNewborn: false },
    ] as never
    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    forest.takenBy = [{ playerId: player.id, workerId: '6' }]
    writeCardExtraData(player, CARD_ID, 'markedSpaceId', 'forest')

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.onReturnHome).toBeDefined()
    effect!.onReturnHome!(state, player)

    // Worker '6' should be deactivated and removed from forest
    const worker6 = (player.workers ?? []).find((w) => w.id === '6')!
    expect(worker6.isActive).toBe(false)
    const forestAfter = state.actionSpaces.find((s) => s.id === 'forest')!
    expect(forestAfter.takenBy.some((t) => t.workerId === '6')).toBe(false)
    // Flag cleared
    expect(readCardExtraData(player, CARD_ID, 'markedSpaceId')).toBeUndefined()
  })

  it('onReturnHome no-op when no markedSpaceId is set', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    // Calling onReturnHome with no flag must not throw or mutate workers
    const beforeWorkers = [...(player.workers ?? [])].map((w) => ({ ...w }))
    effect!.onReturnHome!(state, player)
    expect(player.workers).toEqual(beforeWorkers)
  })

  it('passing flag is removed from card metadata', () => {
    // Spec §决策点 1 + §自检 2: B22 must not declare passing:true once
    // the real onBuy place-farmer behavior is implemented.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    // CardBase exposes `passing` via toJSON(); test uses the imported class.
    expect((B22_WalkingBoots as { passing?: boolean }).passing).toBeFalsy()
  })

  describe('prerequisite "At Most 4 People"', () => {
    it('blocks when player already has 5 farmers', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      const next: typeof player.workers = []
      for (let i = 0; i < 5; i += 1) {
        next.push({ id: `worker-${i}`, isActive: true, isNewborn: false })
      }
      player.workers = next
      expect(meetsCardPrerequisites(player, B22_WalkingBoots, state.round, state)).toBe(false)
    })

    it('allows when player has 4 or fewer farmers', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B22_WalkingBoots, state.round, state)).toBe(true)
    })
  })
})
