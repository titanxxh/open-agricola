import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/game/player'

import '../../shared/cards/A/A116_WoodCutter'

// Plow positive test driven via direct commitFarmChoice on a pending choice
// that carries a sourceCard. We assemble the pending state manually rather
// than running a full card scenario, since most "free plow" cards need a
// long lead-in (round / stage / occupation conditions).
describe('gained.field pseudo-stat', () => {
  it('writes gained.field to sourceCard when commitFarmChoice plows', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    // Inject a pending plow choice with a sourceCard. The sourceCard does not
    // need to be a real card — we just need the stats write-point to fire.
    state.players[0]!.fields = []

    session.loadState(state)
    // Manually open the engine to a plow farm-choice via takeAction(`farmland`).
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // Inject sourceCard onto the pending choice for this assertion.
    const pending = session.getState().pending
    if (pending.type === 'choice') {
      pending.sourceCard = 'TEST_PlowCard'
    }

    const farmResp = session.commitFarmChoice(0, 'plow', { tile: { row: 0, col: 0 } })
    expect(farmResp.ok).toBe(true)

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'TEST_PlowCard')
    expect(stats?.gained?.field).toBe(1)
  })
})

describe('gained.stable pseudo-stat', () => {
  it('writes gained.stable to sourceCard when commitFarmChoice builds stables', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    state.players[0]!.resources.wood = 10

    session.loadState(state)
    const resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    const pending = session.getState().pending
    if (pending.type === 'choice') {
      pending.sourceCard = 'TEST_StableCard'
    }

    const farmResp = session.commitFarmChoice(0, 'stable', { stables: [{ row: 0, col: 0 }] })
    expect(farmResp.ok).toBe(true)

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'TEST_StableCard')
    expect(stats?.gained?.stable).toBe(1)
  })
})

describe('gained.occupation pseudo-stat', () => {
  it('does NOT write gained.occupation to the directly-played occupation card', () => {
    // Standard player-driven `lessons` action -> playOccupation has no sourceCard,
    // so the played occupation should not accumulate gained.occupation on itself.
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    session.loadState(state)
    // Drive `play-occupation` via lessons action with the chosen card
    const lessonsResp = session.takeAction(0, 'lessons')
    expect(lessonsResp.ok).toBe(true)

    // Resolve the choice -> play A116
    const pending = session.getState().pending
    if (pending.type === 'choice') {
      session.resolveChoice(0, 'A116_WoodCutter')
    }

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'A116_WoodCutter')
    expect(stats?.gained?.occupation ?? 0).toBe(0)
  })
})
