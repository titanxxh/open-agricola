import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E086_PenBuilder'
import type { AnytimeAction } from '../../shared/contract/types';
import type { AnimalZone } from '../../shared/domain/animal-zones'

describe('E086_PenBuilder session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('E086_PenBuilder')
    session.loadState(state)
    session.devPlayCard(0, 'E086_PenBuilder')
    return session
  }

  /** Take farmland action to enter active interaction with a plow choice */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('anytime appears when player has wood', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('E86-pen-builder-anytime')
  })

  it('anytime not available without wood', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('E86-pen-builder-anytime')
  })

  it('pay 1 wood increments discards counter', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 5
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(4) // 5 - 1
    expect(updatedPlayer.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(1)
  })

  it('can use multiple times (not once per round)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 5
    session.loadState(state)

    enterActiveInteraction(session)

    // First use
    const resp1 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp1.ok).toBe(true)
    expect(resp1.state.players[0]!.resources.wood).toBe(4)
    expect(resp1.state.players[0]!.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(1)

    // Second use - should still be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('E86-pen-builder-anytime')

    const resp2 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(3)
    expect(resp2.state.players[0]!.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(2)

    // Third use
    const resp3 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp3.ok).toBe(true)
    expect(resp3.state.players[0]!.resources.wood).toBe(2)
    expect(resp3.state.players[0]!.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(3)
  })

  it('onComputeAnimalZones adds capacity based on discards', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3
    session.loadState(state)

    // Before any discards - no card zone
    let zones = computeAnimalZones(player)
    const cardZoneBefore = zones.find((z: InteractionAnimalReorgZone) => z.id === 'card:E086_PenBuilder')
    expect(cardZoneBefore).toBeUndefined()

    // Enter interaction and discard wood twice
    enterActiveInteraction(session)

    session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    const resp2 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    zones = computeAnimalZones(updatedPlayer)
    const cardZone = zones.find((z: AnimalZone) => z.id === 'card:E086_PenBuilder')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(4) // 2 discards * 2 = 4
  })
})
