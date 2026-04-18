import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/D/D70_StrawManure'

describe('D70_StrawManure session', () => {
  const setupHarvest = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D70_StrawManure')
    player.resources.grain = 3

    // Two vegetable fields with crops + one grain field
    player.fields = [
      { row: 0, col: 0, crop: 'vegetable', remaining: 2 },
      { row: 0, col: 1, crop: 'vegetable', remaining: 1 },
      { row: 0, col: 2, crop: 'grain', remaining: 3 },
    ]

    session.loadState(state)
    return { session, player: state.players[0]! }
  }

  it('pays 1 grain and adds 1 vegetable to up to 2 selected vegetable fields', () => {
    const { session } = setupHarvest()

    let resp = session.performRoundEnd()
    // First choice: optional accept/skip for the Straw Manure sequence
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected choice')

    // Accept the optional sequence
    const acceptOption = resp.pending.options.find((o: any) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    // Second choice: selection for vegetable fields
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected selection choice')

    // Select both vegetable fields: 0-0 and 0-1
    resp = session.resolveChoice(0, '0-0,0-1')
    expect(resp.ok).toBe(true)

    // After resolving, continue through harvest phases (feed, breed)
    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
    }

    const p = resp.state.players[0]!
    // Initial grain=3, paid 1, harvested 1 from grain field: 3 - 1 + 1 = 3
    expect(p.resources.grain).toBe(3)

    // After card effect: field 0-0 remaining 2→3, then normal harvest reaps 1 → 2
    const f0 = p.fields.find(f => f.row === 0 && f.col === 0)!
    expect(f0.remaining).toBe(2)

    // After card effect: field 0-1 remaining 1→2, then normal harvest reaps 1 → 1
    const f1 = p.fields.find(f => f.row === 0 && f.col === 1)!
    expect(f1.remaining).toBe(1)

    // Player gained vegetables from harvest: 2 (normal) from 2 veg fields
    expect(p.resources.vegetable).toBeGreaterThanOrEqual(2)

    // Grain field: was 3, harvested 1 → remaining 2
    const f2 = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f2.remaining).toBe(2)
  })

  it('player can decline the optional effect', () => {
    const { session } = setupHarvest()

    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected choice')

    // Skip the optional
    resp = session.resolveChoice(0, '__skip__')

    // Continue through harvest
    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
    }

    const p = resp.state.players[0]!
    // Grain not spent: initial 3 + 1 from harvest = 4
    expect(p.resources.grain).toBe(4)
  })

  it('does not trigger when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D70_StrawManure')
    player.resources.grain = 0
    player.fields = [
      { row: 0, col: 0, crop: 'vegetable', remaining: 2 },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()
    // No optional choice since grain = 0
    if (resp.pending.type === 'choice') {
      expect(resp.pending.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })

  it('does not trigger when no vegetable fields have crops', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D70_StrawManure')
    player.resources.grain = 3
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 3 },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()
    // No choice for Straw Manure since no vegetable fields
    if (resp.pending.type === 'choice') {
      expect(resp.pending.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })
})
