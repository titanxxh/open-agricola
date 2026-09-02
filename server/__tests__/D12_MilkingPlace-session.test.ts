import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D012_MilkingPlace'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

const CARD_ID = 'D012_MilkingPlace'

const playMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'meeting-place')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

describe('D012_MilkingPlace session', () => {
  const setup = () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return session
  }

  it('D012 S1: playing Milking Place pays one grain and leaves it in play', () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.resources.grain = 1
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })

  it('D012 S3: Milking Place removes the house animal zone', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeUndefined()
  })

  it('D012 S4: without Milking Place the house animal zone has capacity one', () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
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

  it('D012 S2: Milking Place grants one food during harvest feeding', () => {
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

  it('without card, same harvest setup results in begging', () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
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
