import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C19_SwingPlow'

describe('C19_SwingPlow session', () => {
  const setup = (stackSize = 4) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('C19_SwingPlow')
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['C19_SwingPlow'] = {
      stack: Array(stackSize).fill('field'),
    }

    session.loadState(state)
    return session
  }

  it('stack has 4 field tiles after setup', () => {
    const session = setup()
    const state = session.getState().state
    const stack = getCardStack(state.players[0]!, 'C19_SwingPlow')
    expect(stack.length).toBe(4)
  })

  it('using farmland offers up to 2 optional plows, accept both', () => {
    const session = setup()

    // Take farmland
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')

    // Complete farmland plow
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })
    expect(resp.ok).toBe(true)

    // First optional plow from card
    expect(resp.pending.type).toBe('choice')
    const accept1 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(accept1).toBeDefined()
    resp = session.resolveChoice(0, accept1!.value)
    expect(resp.ok).toBe(true)

    // pop-card-stack runs, then plow tile selection
    expect(resp.interaction.stateId).toBe('farmSelect')
    const tile2 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile2 })
    expect(resp.ok).toBe(true)

    // Second optional plow from card
    expect(resp.pending.type).toBe('choice')
    const accept2 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(accept2).toBeDefined()
    resp = session.resolveChoice(0, accept2!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('farmSelect')
    const tile3 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile3 })
    expect(resp.ok).toBe(true)

    // Stack should have 2 fields left (4 - 2)
    const stack = getCardStack(resp.state.players[0]!, 'C19_SwingPlow')
    expect(stack.length).toBe(2)

    // Player should have 3 fields (farmland + 2 from card)
    expect(resp.state.players[0]!.fields.length).toBe(3)
  })

  it('accept first plow, skip second', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })

    // Accept first optional plow
    const accept1 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    resp = session.resolveChoice(0, accept1!.value)
    const tile2 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile2 })

    // Skip second optional plow
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Stack should have 3 fields left (4 - 1)
    const stack = getCardStack(resp.state.players[0]!, 'C19_SwingPlow')
    expect(stack.length).toBe(3)

    expect(resp.state.players[0]!.fields.length).toBe(2)
  })

  it('skip first plow skips both', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })

    // Skip first optional plow
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Stack unchanged
    const stack = getCardStack(resp.state.players[0]!, 'C19_SwingPlow')
    expect(stack.length).toBe(4)

    expect(resp.state.players[0]!.fields.length).toBe(1)
  })

  it('only 1 field left offers only 1 plow', () => {
    const session = setup(1) // only 1 field on card

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })

    // Accept the single optional plow
    expect(resp.pending.type).toBe('choice')
    const accept1 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    resp = session.resolveChoice(0, accept1!.value)
    const tile2 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile2 })

    // Should not get another optional choice (stack is now empty)
    // Action should complete (no second plow offered)
    const stack = getCardStack(resp.state.players[0]!, 'C19_SwingPlow')
    expect(stack.length).toBe(0)
    expect(resp.state.players[0]!.fields.length).toBe(2)
  })

  it('no extra plow offered when stack is empty', () => {
    const session = setup(0) // empty stack

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })

    // No optional choice
    expect(resp.pending.type).not.toBe('choice')
    expect(resp.state.players[0]!.fields.length).toBe(1)
  })
})
