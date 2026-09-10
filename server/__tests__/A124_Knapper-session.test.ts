import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A124_Knapper'

const CARD_ID = 'A124_Knapper'

describe('A124_Knapper session', () => {
  const setupForRound = (round: number, revealedSpaceId: string) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Reveal the specified action-card space on the given round.
    state.roundActionOrder[round - 1] = revealedSpaceId

    // Stock the revealed space with some resources so we can measure gain.
    const space = state.actionSpaces.find((s) => s.id === revealedSpaceId)
    if (space) {
      space.resources.stone = 1
    }

    session.loadState(state)
    return session
  }

  it('grants 1 STONE when placing on a round-5 action-card space', () => {
    const session = setupForRound(5, 'western-quarry')
    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Space yields 1 stone (we stocked 1). Card adds +1. Total = 2.
    expect(p.resources.stone ?? 0).toBe(2)
  })

  it('grants 1 STONE when placing on a round-7 action-card space', () => {
    const session = setupForRound(7, 'western-quarry')
    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    expect(p.resources.stone ?? 0).toBe(2)
  })

  it('does not trigger on a non-action-card space (day-laborer)', () => {
    const session = setupForRound(5, 'western-quarry')
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // day-laborer is a common (not round-card) space; knapper shouldn't fire.
    expect(p.resources.stone ?? 0).toBe(0)
  })

  it('does not trigger on round 4 action-card space (outside 5-7 range)', () => {
    // Space revealed on round 4 — the card should NOT trigger.
    const session = setupForRound(4, 'eastern-quarry')
    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // eastern-quarry gives stone from its accumulated resources, but Knapper
    // should add nothing (only 1 stone from the space, not 2).
    // We stocked the space with 1 stone, so total should be exactly 1.
    expect(p.resources.stone ?? 0).toBe(1)
  })

  it('does not trigger when card is not played', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundActionOrder[4] = 'western-quarry'

    const wq = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (wq) wq.resources.stone = 1

    session.loadState(state)

    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Only the space's own stone (1), no bonus from Knapper.
    expect(p.resources.stone ?? 0).toBe(1)
  })
})

describe('A124 Knapper parity', () => {
  const CARD_ID = 'A124_Knapper'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true }: { played?: boolean } = {}) => {
    const session = new GameSession(6124, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[4] = 'pig-market'
    state.roundActionOrder[5] = 'vegetable-seeds'
    state.roundActionOrder[6] = 'western-quarry'
    state.roundActionOrder[7] = 'cattle-market'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    for (const id of ['pig-market', 'vegetable-seeds', 'western-quarry', 'cattle-market']) {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      if (!space) throw new Error(`missing ${id}`)
      space.roundAvailable = 1
      space.takenBy = []
    }
    state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 0
    state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 0
    state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 1
    session.loadState(state)
    return session
  }

  it('A124 S2: its stone arrives before and unlocks the empty round-five Pig Market', () => {
    const session = setup()
    expect(session.getActionAvailability(0)['pig-market']).toBe(true)

    const response = session.takeAction(0, 'pig-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, boar: 0 })
  })

  it('A124 S3: using the round-six Vegetable Seeds gains exactly one stone', () => {
    const response = setup().takeAction(0, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, vegetable: 1 })
  })

  it('A124 S4: its stone arrives before and unlocks the empty round-seven Western Quarry', () => {
    const session = setup()
    expect(session.getActionAvailability(0)['western-quarry']).toBe(true)

    const response = session.takeAction(0, 'western-quarry')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('A124 S5: round-eight and basic action spaces grant no Knapper stone', () => {
    const roundEight = setup().takeAction(0, 'cattle-market')
    expect(roundEight.ok, roundEight.error).toBe(true)
    expect(roundEight.state.players[0]!.resources.stone).toBe(0)

    const basic = setup().takeAction(0, 'day-laborer')
    expect(basic.ok, basic.error).toBe(true)
    expect(basic.state.players[0]!.resources.stone).toBe(0)
  })
})
