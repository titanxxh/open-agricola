import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/E/E91_PlowBuilder'
import type { AnytimeAction } from '../../shared/game/types';

describe('E91_PlowBuilder session', () => {
  const setup = (round = 4) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationHand.push('E91_PlowBuilder')
    session.loadState(state)
    session.devPlayCard(0, 'E91_PlowBuilder')

    // Give the player Major_Joinery and food
    const st2 = session.getState().state
    const p = st2.players[0]!
    p.improvements.push('Major_Joinery')
    p.resources.food = 5
    session.loadState(st2)

    return session
  }

  /** Take farmland action to enter active interaction */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')
    return resp
  }

  it('available during harvest round with Joinery + food', () => {
    const session = setup(4) // round 4 is a harvest round
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('E91-plow-builder-anytime')
  })

  it('pay 1 food and plow 1 field', () => {
    const session = setup(4)
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'E91-plow-builder-anytime')
    expect(resp.ok).toBe(true)

    // After paying food, plow action starts — should show farmSelect for tile selection
    expect(resp.pending.type).toBe('choice')
    expect(resp.interaction.stateId).toBe('farmSelect')

    // Commit the plow choice
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitFarmChoice(0, 'plow', { tile })
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Should have paid 1 food (started with 5)
    expect(p.resources.food).toBe(4)
    // Should have gained a new field
    expect(p.fields.length).toBeGreaterThanOrEqual(1)
    // Card should be flagged (one-time per harvest)
    expect(p.cardStates?.['E91_PlowBuilder']?.flagged).toBe(true)
  })

  it('NOT available in non-harvest round', () => {
    const session = setup(3) // round 3 is not a harvest round
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('NOT available without food', () => {
    const session = setup(4)
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('NOT available without Joinery', () => {
    const session = setup(4)
    const state = session.getState().state
    state.players[0]!.improvements = state.players[0]!.improvements.filter(
      (id) => id !== 'Major_Joinery',
    )
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('one-time per harvest (flagged after use, reset at onAfterHarvest)', () => {
    const session = setup(4)
    enterActiveInteraction(session)

    // Use the anytime action
    let resp = session.takeAnytimeAction(0, 'E91-plow-builder-anytime')
    expect(resp.ok).toBe(true)

    // Complete the plow
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitFarmChoice(0, 'plow', { tile })
    expect(resp.ok).toBe(true)

    // Card should now be flagged
    expect(resp.state.players[0]!.cardStates?.['E91_PlowBuilder']?.flagged).toBe(true)

    // The anytime action should no longer appear
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })
})
