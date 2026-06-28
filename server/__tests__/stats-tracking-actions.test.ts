import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import { setStartPlayer } from '../../shared/actions/effects/first-player'

describe('PlayerStats action tracking', () => {
  it('incPlacedFarmers fires once per place', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    session.loadState(state)

    expect(session.getState().state.players[0]!.stats.placedFarmers).toBe(0)

    const resp1 = session.takeAction(0, 'forest')
    expect(resp1.ok).toBe(true)
    expect(session.getState().state.players[0]!.stats.placedFarmers).toBe(1)

    // place a second worker on a different action space; force the same player back
    const after1 = session.getState().state
    after1.currentPlayerIndex = 0
    session.loadState(after1)
    const resp2 = session.takeAction(0, 'day-laborer')
    expect(resp2.ok).toBe(true)
    expect(session.getState().state.players[0]!.stats.placedFarmers).toBe(2)
  })

  it('starting first player has firstPlayerCount=1, others 0', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    expect(state.players[0]!.stats.firstPlayerCount).toBe(1)
    expect(state.players[1]!.stats.firstPlayerCount).toBe(0)
  })

  it('incFirstPlayer fires when first-player rotates each year', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    // simulate p2 having taken the "set first player" effect during round 1.
    // We move start-player marker over so when round 2 begins, p2 receives +1.
    setStartPlayer(state, state.players[1]!)
    state.round = 2
    session.loadState(state)

    // invoke the round-start path directly (private method on GameCore).
    const core = session as unknown as { continueBeforeStartOfTurn: () => void }
    core.continueBeforeStartOfTurn()

    const after = session.getState().state
    expect(after.players[1]!.stats.firstPlayerCount).toBe(1)
    // p1 should still hold its initial 1 from being starting first player
    expect(after.players[0]!.stats.firstPlayerCount).toBe(1)
  })

  it('incFirstPlayer is not double-counted on round 1 init', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    // p1 was starting first player → starts at 1.
    // Calling continueBeforeStartOfTurn while round===1 must not bump it.
    const core = session as unknown as { continueBeforeStartOfTurn: () => void }
    core.continueBeforeStartOfTurn()
    const after = session.getState().state
    expect(after.players[0]!.stats.firstPlayerCount).toBe(1)
    expect(after.players[1]!.stats.firstPlayerCount).toBe(0)
  })

  it('totalRoomsBuilt increments when a room is constructed via farm-expansion', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = { ...player.resources, wood: 5, reed: 2 }
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)

    session.loadState(state)
    expect(session.getState().state.players[0]!.stats.totalRoomsBuilt).toBe(0)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // First a choice: construct (rooms) vs stables. Pick construct.
    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected initial farm-expansion choice')
    }
    const constructOption = resp.interaction.options?.find((o) =>
      typeof o.value === 'string' && o.value.startsWith('seq-construct'),
    )
    if (!constructOption) throw new Error('construct option missing')
    resp = session.resolveChoice(0, constructOption.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected farmSelect interaction')
    }
    if (resp.interaction.farm.farmType !== 'room') {
      throw new Error('expected farm type room')
    }
    const tile = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [tile] })
    expect(resp.ok).toBe(true)
    expect(session.getState().state.players[0]!.rooms).toBe(3)
    expect(session.getState().state.players[0]!.stats.totalRoomsBuilt).toBe(1)
  })

  it('totalOccupationBuilt increments when an occupation is played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    player.resources = { ...player.resources, food: 5 }
    // pick first occupation in hand to play
    const occId = player.occupationHand[0]
    if (!occId) throw new Error('player needs at least one occupation in hand')
    session.loadState(state)
    expect(session.getState().state.players[0]!.stats.totalOccupationBuilt).toBe(0)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected occupation choice')
    const opt = resp.interaction.options?.find((o) => o.value === occId)
    if (!opt) {
      // fallback: pick first non-skip option
      const first = resp.interaction.options?.find((o) => o.value !== '__skip__')
      if (!first) throw new Error('no occupation option found')
      resp = session.resolveChoice(0, first.value)
    } else {
      resp = session.resolveChoice(0, opt.value)
    }
    // Some occupation flows continue with sub-choices; finishing them all is
    // out-of-scope. We assert the played list updated and stats fired.
    const after = session.getState().state.players[0]!
    expect(after.occupationPlayed.length).toBeGreaterThanOrEqual(1)
    expect(after.stats.totalOccupationBuilt).toBe(after.occupationPlayed.length)
  })

  it('totalMajorBuilt increments when a major improvement is played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    player.resources = { ...player.resources, food: 5, clay: 3 }
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)
    expect(session.getState().state.players[0]!.stats.totalMajorBuilt).toBe(0)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected major choice')
    const opt = resp.interaction.options?.find((o) => o.value === 'Major_Fireplace1')
    if (!opt) throw new Error('Fireplace1 option missing')
    resp = session.resolveChoice(0, opt.value)
    expect(resp.ok).toBe(true)
    expect(session.getState().state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(session.getState().state.players[0]!.stats.totalMajorBuilt).toBe(1)
  })
})
