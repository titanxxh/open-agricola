import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D127_HardworkingMan'

const CARD_ID = 'D127_HardworkingMan'

describe('D127_HardworkingMan session', () => {
  /**
   * Setup: 2-player game; owner = p0.
   * onBuy registers the player action space. Owner has fewer rooms than the
   * other player so canBeExecutedByPlayer returns true.
   */
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    const owner = state.players[0]!
    const opp = state.players[1]!
    owner.rooms = 2
    opp.rooms = 3 // strictly greater so D127 condition satisfied
    owner.workersAvailable = 1
    opp.workersAvailable = 0
    owner.familySize = 1
    opp.familySize = 1
    // Plenty of food to "buy" things later if needed; D127 itself has no cost.
    owner.resources = {
      ...owner.resources,
      food: 5,
      wood: 5,
      clay: 5,
      stone: 5,
      reed: 5,
    }

    owner.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state
    updated.currentPlayerIndex = 0
    updated.players[0]!.workersAvailable = 1
    session.loadState(updated)
    return session
  }

  it('onBuy registers a player action space', () => {
    const session = setup()
    const state = session.getState().state
    expect(state.actionSpaces.some((s) => s.id === CARD_ID)).toBe(true)
  })

  it('canBeExecutedByPlayer: only owner satisfies when other has more rooms', () => {
    const session = setup()
    const state = session.getState().state
    const space = state.actionSpaces.find((s) => s.id === CARD_ID)!
    const owner = state.players[0]!
    const opp = state.players[1]!
    expect(space.canBeExecutedByPlayer!(state, owner)).toBe(true)
    expect(space.canBeExecutedByPlayer!(state, opp)).toBe(false)
  })

  it('canBeExecutedByPlayer: false if any other player has equal or fewer rooms', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    const opp = state.players[1]!
    opp.rooms = 2 // tie
    session.loadState(state)
    const refreshed = session.getState().state
    const space = refreshed.actionSpaces.find((s) => s.id === CARD_ID)!
    expect(space.canBeExecutedByPlayer!(refreshed, refreshed.players[0]!)).toBe(false)
    expect(owner.rooms).toBe(2)
  })

  it('execute returns an or-flow with three children (all three executable)', () => {
    const session = setup()
    const state = session.getState().state
    const space = state.actionSpaces.find((s) => s.id === CARD_ID)!
    const owner = state.players[0]!
    const result = space.execute({ state, player: owner, space })
    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow.type).toBe('or')
    if (result.flow.type !== 'or') return
    const ids = result.flow.children.map((c) => (c as { actionId: string }).actionId)
    expect(ids).toEqual(['day-laborer', 'construct', 'improvement'])
  })

  it('only day-laborer leaf: gain 2 food then __done__ resolves OR', () => {
    const session = setup()
    let state = session.getState().state
    const owner = state.players[0]!
    const beforeFood = owner.resources.food

    let resp = session.takeAction(0, CARD_ID)
    expect(resp.ok).toBe(true)
    // OR pending choice should be present
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected OR choice')
    const dayLaborerOption = resp.interaction.options?.find((o) =>
      typeof o.labelKey === 'string' && o.labelKey.includes('day-laborer'),
    ) ?? resp.interaction.options[0]
    resp = session.resolveChoice(0, dayLaborerOption!.value)
    expect(resp.ok).toBe(true)

    // After day-laborer leaf executed, OR re-prompts (still has choice for next branch / __done__)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.some((o) => o.value === '__done__')).toBe(true)

    resp = session.resolveChoice(0, '__done__')
    expect(resp.ok).toBe(true)

    state = resp.state
    const finalOwner = state.players[0]!
    expect(finalOwner.resources.food).toBe(beforeFood + 2)
  })
})
