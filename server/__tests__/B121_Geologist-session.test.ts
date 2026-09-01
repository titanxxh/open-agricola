import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B121_Geologist'

const CARD_ID = 'B121_Geologist'
const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
  { occupation: 'C109_SchnappsDistiller', minor: 'C004_WritingBoards' },
  { occupation: 'E113_Godmother', minor: 'E007_Pumpernickel' },
]

describe('B121_Geologist session', () => {
  const setup = (playerCount: 2 | 3 | 4 = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.players.forEach((player, index) => {
      player.occupationHand = [FIXED_HANDS[index]!.occupation]
      player.minorHand = [FIXED_HANDS[index]!.minor]
    })
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players.forEach((p) => (p.workersAvailable = 2))

    // Pre-seed accumulation on relevant spaces
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const reed = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (reed) reed.resources.reed = 1
    const clay = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clay) clay.resources.clay = 2

    session.loadState(state)
    return session
  }

  it('B121 S1: Forest grants its accumulation and one extra clay', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const woodBefore = session.getState().state.players[0]!.resources.wood
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 1)
    expect(after.resources.wood).toBe(woodBefore + 3)
  })

  it('B121 S2: Reed Bank grants its accumulation and one extra clay', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const reedBefore = session.getState().state.players[0]!.resources.reed
    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 1)
    expect(after.resources.reed).toBe(reedBefore + 1)
  })

  it('B121 S4: Clay Pit grants no extra clay with two players', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // accumulates 2 clay but no geologist bonus at 2 players
    expect(after.resources.clay).toBe(before + 2)
  })

  it('B121 S3: Clay Pit grants one extra clay with three players', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 2 + 1)
  })

  it('B121 S5: unrelated and opponent actions grant the owner no clay', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(before)

    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)
    const opponent = session.takeAction(1, 'forest')
    expect(opponent.ok).toBe(true)
    expect(opponent.state.players[0]!.resources.clay).toBe(before)
  })
})
