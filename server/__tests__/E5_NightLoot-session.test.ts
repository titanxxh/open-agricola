import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionSpace, Resource } from '../../shared/contract/types'

import { E5_NightLoot } from '../../shared/cards-display/E/E5_NightLoot'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E5_NightLoot'

describe('E5_NightLoot session', () => {
  const setupSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onBuy offers XOR of 2-resource pairs from available accumulation spaces', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Ensure at least 2 different building resource types on accumulation spaces
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    const claySpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.clay ?? 0) > 0,
    )
    if (woodSpace) woodSpace.resources.wood = 3
    if (claySpace) claySpace.resources.clay = 2

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)

    if (woodSpace && claySpace) {
      expect(flow).toBeDefined()
      // Should be xor with pair options
      expect(flow!.type).toBe('xor')
    }
  })

  it('onBuy returns single gain when only 1 resource type available', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Clear all accumulation spaces, then add just wood
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    if (woodSpace) woodSpace.resources.wood = 3

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)

    if (woodSpace) {
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('leaf')
      const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
      expect(leaf.actionId).toBe('take-from-space')
      expect(leaf.actionContext?.resource).toBe('wood')
      expect(leaf.actionContext?.amount).toBe(1)
    }
  })

  it('onBuy returns undefined when no accumulation spaces have resources', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Clear all accumulation space resources
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy choices contain correct resource pairs', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Set up exactly wood and stone available
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    const stoneSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.stone ?? 0) > 0,
    )
    if (woodSpace) woodSpace.resources.wood = 2
    if (stoneSpace) stoneSpace.resources.stone = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)

    if (woodSpace && stoneSpace) {
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('xor')
      const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
      // Should have exactly 1 pair: wood+stone
      expect(children.length).toBe(1)
    }
  })

  it('passing flag is removed from card metadata', () => {
    expect((E5_NightLoot as { passing?: boolean }).passing).toBeFalsy()
  })

  it('onBuy uses take-from-space leaves that decrement accumulation spaces', () => {
    // BGA `E5_NightLoot::actSelectResources` decrements the chosen
    // accumulation space's resources. Our previous impl used gain leaves
    // pulling from the general supply, so the accumulation space was left
    // untouched (the player effectively double-banked the resource).
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    const woodSpace = state.actionSpaces.find((s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0)
    const stoneSpace = state.actionSpaces.find((s: ActionSpace) => (s.gainPerRound.stone ?? 0) > 0)
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    if (woodSpace) woodSpace.resources.wood = 2
    if (stoneSpace) stoneSpace.resources.stone = 1

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as ActionFlow

    if (!woodSpace || !stoneSpace) return
    expect(flow.type).toBe('xor')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    // Exactly 1 (wood+stone) pair candidate; must be a SEQ of 2
    // take-from-space leaves, not a single gain leaf.
    expect(children.length).toBe(1)
    const child = children[0]
    expect(child.type).toBe('seq')
    const inner = (child as Extract<ActionFlow, { type: 'seq' }>).children
    expect(inner.length).toBe(2)
    inner.forEach((leaf) => {
      expect(leaf.type).toBe('leaf')
      expect((leaf as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('take-from-space')
    })
  })

})
