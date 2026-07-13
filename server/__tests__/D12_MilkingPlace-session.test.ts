import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D012_MilkingPlace'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

describe('D012_MilkingPlace session', () => {
  /**
   * D012_MilkingPlace is not in catalog.ts, so devPlayCard misclassifies it as
   * an occupation. We manually push it into minorPlayed instead.
   */
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Manually add to minorPlayed since devPlayCard can't resolve non-catalog minors
    player.minorPlayed.push('D012_MilkingPlace')
    session.loadState(state)
    return session
  }

  it('removes house zone after card is played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeUndefined()
  })

  it('house zone exists without the card', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    session.loadState(state)

    const player = state.players[0]!
    const zones = computeAnimalZones(player)
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeDefined()
    expect(houseZone!.capacity).toBe(1)
  })

  it('grants 1 food during harvest feeding phase', () => {
    const session = setup()
    const state = session.getState().state

    // Set up for harvest round 4
    state.round = 4
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough food so no begging
    }
    // Player 0 starts with exactly 1 food (needs 2 to feed family of 1)
    // With the card granting 1 food, total becomes 2 — just enough, no begging
    state.players[0]!.resources.food = 1
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    // Player 0 had 1 food, got 1 from MilkingPlace card = 2 food total.
    // Family of 1 requires 2 food. Should have 0 begging.
    const playerAfter = session.getState().state.players[0]!
    expect(playerAfter.resources.begging).toBe(0)
    // Food should be fully consumed
    expect(playerAfter.resources.food).toBe(0)
  })

  it('without card, same setup results in begging', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4

    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10
    }
    // Player 0 has only 1 food, needs 2 for family of 1, no card
    state.players[0]!.resources.food = 1
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    // Without the card: 1 food, need 2, so 1 begging
    const playerAfter = session.getState().state.players[0]!
    expect(playerAfter.resources.begging).toBe(1)
  })
})
