import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A156_Buyer'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

describe('A156_Buyer session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('A156_Buyer')
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
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // The optional flow should present a choice to accept or skip
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      // Find the non-skip option (accept)
      const acceptOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      expect(acceptOption).toBeDefined()
      resp = session.resolveChoice(0, acceptOption!.value)
    }

    // Walk through any remaining player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
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
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // The optional flow should present a choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      // Decline by choosing __skip__
      resp = session.resolveChoice(0, '__skip__')
    }

    // Walk through any remaining player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
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
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(1, 'confirm', [])
    }

    // After opponent's action, after-hooks fire with PlayerSwitch
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Accept the optional exchange
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const acceptOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      expect(acceptOption).toBeDefined()
      resp = session.resolveChoice(0, acceptOption!.value)
    }

    // Handle animalReorg for buyer if needed (gaining sheep requires placement)
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      expect(resp.interaction.playerIndex).toBe(0)
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    // Walk through any remaining player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
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
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
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
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Owner should have gained reed from the space but not triggered buyer's own-exchange
    const after = session.getState().state
    // Food should not decrease (no buyer exchange with self)
    expect(after.players[0]!.resources.food).toBe(foodBefore)
    // Reed should increase from the space accumulation, not from buyer
    expect(after.players[0]!.resources.reed).toBeGreaterThanOrEqual(reedBefore + 1)
  })
})

describe('A156 Buyer parity', () => {
  const CARD_ID = 'A156_Buyer'

  const FILLER = '__test_placeholder__'

  const setup = ({ actor = 1, food = 1, played = true } = {}) => {
    const session = new GameSession(6156, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      player.pastures = []
      player.stableAnimals = {}
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.food = food
    for (const [id, resource, count] of [
      ['reed-bank', 'reed', 2],
      ['western-quarry', 'stone', 2],
      ['sheep-market', 'sheep', 1],
    ] as const) {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      if (!space) throw new Error(`missing ${id}`)
      space.takenBy = []
      space.resources[resource] = count
    }
    session.loadState(state)
    return session
  }

  const enterBuyerChoice = (session: GameSession, response: SessionResponse) => {
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    return response
  }

  const acceptPurchase = (session: GameSession, response: SessionResponse) => {
    response = enterBuyerChoice(session, response)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const purchase = response.interaction.request.options?.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
      ?? response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(purchase, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, purchase!.value)
  }

  it('A156 S4: without food the Buyer owner receives no purchasable offer', () => {
    const session = setup({ food: 0 })
    const response = enterBuyerChoice(session, session.takeAction(1, 'reed-bank'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, reed: 0 })
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.sourceCard === CARD_ID && option.value !== '__skip__') ?? false
      : false).toBe(false)
  })

  it('A156 S5: an opponent Western Quarry use can be bought as one stone', () => {
    const session = setup()
    const response = acceptPurchase(session, session.takeAction(1, 'western-quarry'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 })
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, stone: 2 })
  })
})
