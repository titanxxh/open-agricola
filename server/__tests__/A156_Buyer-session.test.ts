import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/A/A156_Buyer'

describe('A156_Buyer session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('A156_Buyer')
    owner.playedCards.push('occupation:A156_Buyer')
    owner.resources.food = 5

    // Ensure reed-bank has accumulated resources (base space, always open)
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 1

    // Ensure sheep-market is open in round 1
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'sheep-market' ? null : id,
    )
    state.roundActionOrder[0] = 'sheep-market'

    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)
    return session
  }

  it('buyer can pay 1 food for 1 reed when opponent uses reed-bank', () => {
    const session = setup(1)
    const s = session.getState().state
    const foodBefore = s.players[0]!.resources.food
    const reedBefore = s.players[0]!.resources.reed
    const opponentFoodBefore = s.players[1]!.resources.food

    // Opponent (p1) uses reed-bank
    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)

    // After opponent's action, after-hooks fire and create PlayerSwitch to buyer owner
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // The optional flow should present a choice to accept or skip
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type === 'choice') {
      // Find the non-skip option (accept)
      const acceptOption = resp.pending.options?.find((o: any) => o.value !== '__skip__')
      expect(acceptOption).toBeDefined()
      resp = session.resolveChoice(0, acceptOption!.value)
    }

    // Walk through any remaining player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // Buyer lost 1 food and gained 1 reed
    expect(after.players[0]!.resources.food).toBe(foodBefore - 1)
    expect(after.players[0]!.resources.reed).toBe(reedBefore + 1)
    // Opponent gained 1 food from buyer's payment
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + 1)
  })

  it('buyer can decline the optional exchange', () => {
    const session = setup(1)
    const s = session.getState().state
    const foodBefore = s.players[0]!.resources.food
    const reedBefore = s.players[0]!.resources.reed

    // Opponent (p1) uses reed-bank
    let resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)

    // After opponent's action, after-hooks fire and create PlayerSwitch to buyer owner
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // The optional flow should present a choice
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type === 'choice') {
      // Decline by choosing __skip__
      resp = session.resolveChoice(0, '__skip__')
    }

    // Walk through any remaining player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // Buyer resources unchanged
    expect(after.players[0]!.resources.food).toBe(foodBefore)
    expect(after.players[0]!.resources.reed).toBe(reedBefore)
  })

  it('buyer can pay 1 food for 1 sheep when opponent uses sheep-market', () => {
    const session = setup(1)
    const s = session.getState().state
    const foodBefore = s.players[0]!.resources.food
    const sheepBefore = s.players[0]!.resources.sheep

    // Opponent (p1) uses sheep-market
    let resp = session.takeAction(1, 'sheep-market')
    expect(resp.ok).toBe(true)

    // Sheep collection triggers animalReorg for opponent first
    if (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(1, [])
    }

    // After opponent's action, after-hooks fire with PlayerSwitch
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // Accept the optional exchange
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type === 'choice') {
      const acceptOption = resp.pending.options?.find((o: any) => o.value !== '__skip__')
      expect(acceptOption).toBeDefined()
      resp = session.resolveChoice(0, acceptOption!.value)
    }

    // Handle animalReorg for buyer if needed (gaining sheep requires placement)
    if (resp.pending.type === 'animalReorg') {
      expect(resp.pending.playerIndex).toBe(0)
      resp = session.confirmAnimalReorg(0, [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    // Walk through any remaining player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(foodBefore - 1)
    expect(after.players[0]!.resources.sheep).toBe(sheepBefore + 1)
  })

  it('buyer offer is not triggered for non-matching spaces', () => {
    const session = setup(1)
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Opponent uses day-laborer (not a matching space)
    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches (there should be none for buyer)
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // No food should be lost
    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(foodBefore)
  })

  it('buyer offer is not triggered when owner uses matching space', () => {
    const session = setup(0)
    const foodBefore = session.getState().state.players[0]!.resources.food
    const reedBefore = session.getState().state.players[0]!.resources.reed

    // Owner (p0) uses reed-bank
    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    // Owner should have gained reed from the space but not triggered buyer's own-exchange
    const after = session.getState().state
    // Food should not decrease (no buyer exchange with self)
    expect(after.players[0]!.resources.food).toBe(foodBefore)
    // Reed should increase from the space accumulation, not from buyer
    expect(after.players[0]!.resources.reed).toBeGreaterThanOrEqual(reedBefore + 1)
  })
})
