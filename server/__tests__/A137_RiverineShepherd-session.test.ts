import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A137_RiverineShepherd'

const CARD_ID = 'A137_RiverineShepherd'

describe('A137_RiverineShepherd session', () => {
  /**
   * Setup with A137 already played.
   * Both sheep-market and reed-bank have accumulated resources.
   * Player 0 has a pasture for sheep placement.
   */
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Give player a pasture for sheep accommodation
    player.pastures = [
      {
        id: 'p1',
        size: 4,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      },
    ]

    // Set up accumulation spaces with resources
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (sheepMarket) sheepMarket.resources.sheep = 2

    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (reedBank) reedBank.resources.reed = 3

    session.loadState(state)
    return session
  }

  it('offers optional reed when using sheep-market (reed-bank has reed)', () => {
    const session = setup()
    const state = session.getState().state
    const reedBefore = state.players[0]!.resources.reed
    const reedBankBefore = state.actionSpaces.find((s) => s.id === 'reed-bank')!.resources.reed
    session.loadState(state)

    // Use sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Confirm animal reorg (place sheep in pasture)
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
    ])

    // After animal reorg, the card offers optional reed gain
    // It may auto-accept or present a choice depending on flow handling
    // Check that reed was gained
    const p = resp.state.players[0]!
    if (resp.interaction.stateId === 'wait') {
      // Accept the optional reed
      const acceptOption = resp.interaction.options?.find(
        (o) => o.value !== '__skip__',
      )
      if (acceptOption) {
        resp = session.resolveChoice(0, acceptOption.value)
      }
    }

    // Handle possible additional animalReorg if needed
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
      ])
    }

    expect(resp.state.players[0]!.resources.reed).toBe(reedBefore + 1)
    expect(resp.state.actionSpaces.find((s) => s.id === 'reed-bank')!.resources.reed).toBe(reedBankBefore - 1)
  })

  it('offers optional sheep when using reed-bank (sheep-market has sheep)', () => {
    const session = setup()
    const state = session.getState().state
    const sheepBefore = state.players[0]!.resources.sheep
    const sheepMarketBefore = state.actionSpaces.find((s) => s.id === 'sheep-market')!.resources.sheep
    session.loadState(state)

    // Use reed-bank
    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    // Reed-bank gives reed, then the card offers optional sheep
    const p = resp.state.players[0]!
    if (resp.interaction.stateId === 'wait') {
      // Accept the optional sheep
      const acceptOption = resp.interaction.options?.find(
        (o) => o.value !== '__skip__',
      )
      if (acceptOption) {
        resp = session.resolveChoice(0, acceptOption.value)
      }
    }

    // Handle animalReorg if sheep was gained
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: sheepBefore + 1 },
      ])
    }

    expect(resp.state.players[0]!.resources.sheep).toBe(sheepBefore + 1)
    expect(resp.state.actionSpaces.find((s) => s.id === 'sheep-market')!.resources.sheep).toBe(sheepMarketBefore - 1)
  })

  it('does NOT offer reed when using sheep-market if reed-bank has no reed', () => {
    const session = setup()
    const state = session.getState().state
    // Empty the reed-bank
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (reedBank) reedBank.resources.reed = 0

    const reedBefore = state.players[0]!.resources.reed
    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
    ])

    // No reed should be gained — card should not have triggered
    expect(resp.state.players[0]!.resources.reed).toBe(reedBefore)
  })

  it('does NOT offer sheep when using reed-bank if sheep-market has no sheep', () => {
    const session = setup()
    const state = session.getState().state
    // Empty the sheep-market
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (sheepMarket) sheepMarket.resources.sheep = 0

    const sheepBefore = state.players[0]!.resources.sheep
    session.loadState(state)

    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    // No sheep should be gained
    expect(resp.state.players[0]!.resources.sheep).toBe(sheepBefore)
  })

  it('does NOT trigger on unrelated action spaces', () => {
    const session = setup()
    const state = session.getState().state
    const reedBefore = state.players[0]!.resources.reed
    const sheepBefore = state.players[0]!.resources.sheep
    session.loadState(state)

    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // No extra resources gained
    expect(resp.state.players[0]!.resources.reed).toBe(reedBefore)
    expect(resp.state.players[0]!.resources.sheep).toBe(sheepBefore)
  })

  it('does NOT trigger if player does not have the card', () => {
    const session = setup()
    const state = session.getState().state
    // Remove the card
    state.players[0]!.occupationPlayed = state.players[0]!.occupationPlayed.filter(
      (id) => id !== CARD_ID,
    )

    const reedBefore = state.players[0]!.resources.reed
    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
    ])

    // No reed gained
    expect(resp.state.players[0]!.resources.reed).toBe(reedBefore)
  })
})
