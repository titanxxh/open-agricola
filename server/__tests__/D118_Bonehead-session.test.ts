import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/D/D118_Bonehead'
import type { ActionChoiceOption } from '../../shared/game/types'

describe('D118_Bonehead session', () => {
  /**
   * Setup with D118_Bonehead already played.
   * After onBuy: 6 wood placed, 1 popped immediately → 5 left on stack.
   */
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Manually add occupation as played (not in catalog)
    player.occupationPlayed.push('D118_Bonehead')
    if (!player.cardStates) player.cardStates = {}
    // 5 wood remaining (1 already taken via onBuy flow)
    player.cardStates['D118_Bonehead'] = {
      stack: ['wood', 'wood', 'wood', 'wood', 'wood'],
    }

    // Give another occupation in hand so we can test playing it
    player.occupationHand.push('A102_Grocer')
    player.resources.food = 5

    session.loadState(state)
    return session
  }

  it('stack has 5 wood after setup (1 already taken at play time)', () => {
    const session = setup()
    const state = session.getState().state
    const stack = getCardStack(state.players[0]!, 'D118_Bonehead')
    expect(stack.length).toBe(5)
    expect(stack.every(item => item === 'wood')).toBe(true)
  })

  it('playing an occupation via lessons gives 1 wood from card', () => {
    const session = setup()
    const state = session.getState().state
    const initialWood = state.players[0]!.resources.wood
    session.loadState(state)

    // Use lessons to play an occupation (A102_Grocer)
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // Should be in choice to select which occupation to play
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected occupation choice')

    // Select A102_Grocer
    const grocerOption = resp.pending.options?.find((o: ActionChoiceOption) => o.value === 'A102_Grocer')
    expect(grocerOption).toBeDefined()
    resp = session.resolveChoice(0, 'A102_Grocer')
    expect(resp.ok).toBe(true)

    // After playing occupation, D118 should have given 1 wood
    const p = resp.state.players[0]!
    const stack = getCardStack(p, 'D118_Bonehead')
    expect(stack.length).toBe(4)
    // Wood gained: initialWood + 1 (from bonehead pop)
    expect(p.resources.wood).toBe(initialWood + 1)
  })

  it('no wood given when stack is empty', () => {
    const session = setup()
    const state = session.getState().state
    const initialWood = state.players[0]!.resources.wood
    state.players[0]!.cardStates!['D118_Bonehead']!.stack = []
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    const grocerOption = resp.pending.options?.find((o: ActionChoiceOption) => o.value === 'A102_Grocer')
    expect(grocerOption).toBeDefined()
    resp = session.resolveChoice(0, 'A102_Grocer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // No wood gain (stack was empty)
    expect(p.resources.wood).toBe(initialWood)
  })
})
