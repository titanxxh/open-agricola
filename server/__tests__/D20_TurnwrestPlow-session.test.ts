import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/D/D20_TurnwrestPlow'

describe('D20_TurnwrestPlow session', () => {
  const setup = (round = 1) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.minorPlayed.push('D20_TurnwrestPlow')
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['D20_TurnwrestPlow'] = { stack: ['field', 'field'] }

    session.loadState(state)
    return session
  }

  it('stack has 2 field tiles after setup', () => {
    const session = setup()
    const state = session.getState().state
    const stack = getCardStack(state.players[0]!, 'D20_TurnwrestPlow')
    expect(stack).toEqual(['field', 'field'])
  })

  it('triggers on farmland, accept both plows', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')

    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })
    expect(resp.ok).toBe(true)

    // First optional plow
    expect(resp.pending.type).toBe('choice')
    const accept1 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(accept1).toBeDefined()
    resp = session.resolveChoice(0, accept1!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('farmSelect')
    const tile2 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile2 })
    expect(resp.ok).toBe(true)

    // Second optional plow
    expect(resp.pending.type).toBe('choice')
    const accept2 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(accept2).toBeDefined()
    resp = session.resolveChoice(0, accept2!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('farmSelect')
    const tile3 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile3 })
    expect(resp.ok).toBe(true)

    // Stack should be empty (2 - 2)
    const stack = getCardStack(resp.state.players[0]!, 'D20_TurnwrestPlow')
    expect(stack.length).toBe(0)

    // 3 fields (farmland + 2 from card)
    expect(resp.state.players[0]!.fields.length).toBe(3)
  })

  it('triggers on cultivation action space', () => {
    // Cultivation appears in round 5
    const session = setup(5)

    let resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    // Cultivation includes plow + optional sow
    expect(resp.interaction.stateId).toBe('farmSelect')

    // Complete the cultivation plow
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })
    expect(resp.ok).toBe(true)

    // After cultivation plow, may get sow choice or card plow choice
    // Walk through sow if offered (decline it)
    if (resp.pending.type === 'choice' && resp.pending.options?.some((o: any) => o.labelKey?.includes('sow') || o.labelKey?.includes('Sow'))) {
      resp = session.resolveChoice(0, '__skip__')
    }

    // Card should offer optional plow
    expect(resp.pending.type).toBe('choice')
    const accept1 = resp.pending.options?.find((o: any) => o.value !== '__skip__')
    expect(accept1).toBeDefined()
    resp = session.resolveChoice(0, accept1!.value)
    expect(resp.ok).toBe(true)

    // Plow from card
    expect(resp.interaction.stateId).toBe('farmSelect')
    const tile2 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile2 })
    expect(resp.ok).toBe(true)

    // Stack should have 1 field left
    const stack = getCardStack(resp.state.players[0]!, 'D20_TurnwrestPlow')
    expect(stack.length).toBe(1)
  })

  it('skip optional plow preserves stack', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.farm.selectableTiles[0]
    resp = session.commitFarmChoice(0, 'plow', { tile: tile1 })

    // Skip optional
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    const stack = getCardStack(resp.state.players[0]!, 'D20_TurnwrestPlow')
    expect(stack.length).toBe(2)
    expect(resp.state.players[0]!.fields.length).toBe(1)
  })

  it('does not trigger on other action spaces', () => {
    const session = setup()

    // Use grain-seeds instead
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    // No choice offered from card (grain-seeds may have its own choices though)
    // Stack should be unchanged
    const stack = getCardStack(resp.state.players[0]!, 'D20_TurnwrestPlow')
    expect(stack.length).toBe(2)
  })
})
