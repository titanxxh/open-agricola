import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { computeScores } from '../../shared/logic/scoring'

import '../../shared/cards/A/A135_AnimalReeve'
import '../../shared/cards/C/C136_RanchProvost'

const A135 = 'A135_AnimalReeve'
const C136 = 'C136_RanchProvost'

const bonusVp = (
  scores: ReturnType<typeof computeScores>,
  playerId: string,
): number => {
  const entry = scores.find((s) => s.playerId === playerId)
  return entry?.categories.find((c) => c.key === 'cardStateBonusVp')?.total ?? 0
}

const setupThreePlayers = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 3 })
  const state = session.getState().state
  state.players.forEach((p) => {
    p.resources = { ...p.resources, sheep: 0, boar: 0, cattle: 0 }
    p.pastures = []
    p.fenceSegments = []
  })
  return state
}

describe('A135_AnimalReeve sharedScoring', () => {
  it('awards 0 VP when min(sheep, boar, cattle) < 2 (no card)', () => {
    const state = setupThreePlayers()
    state.players[0]!.resources.sheep = 5
    state.players[0]!.resources.boar = 5
    state.players[0]!.resources.cattle = 1

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(0)
  })

  it('does not award the bonus when no player owns A135', () => {
    const state = setupThreePlayers()
    state.players[0]!.resources.sheep = 4
    state.players[0]!.resources.boar = 4
    state.players[0]!.resources.cattle = 4

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(0)
  })

  it('awards 1 VP when min animal count >= 2', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(A135)
    state.players[1]!.resources.sheep = 2
    state.players[1]!.resources.boar = 2
    state.players[1]!.resources.cattle = 2

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(1)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(0)
    expect(bonusVp(scores, state.players[2]!.id)).toBe(0)
  })

  it('awards 3 VP when min animal count >= 3', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(A135)
    state.players[1]!.resources.sheep = 3
    state.players[1]!.resources.boar = 5
    state.players[1]!.resources.cattle = 3

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(3)
  })

  it('awards 5 VP when min animal count >= 4', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(A135)
    state.players[1]!.resources.sheep = 4
    state.players[1]!.resources.boar = 4
    state.players[1]!.resources.cattle = 4

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(5)
  })

  it('caps at 5 VP for min >= 5 (cap to 4 in BGA map)', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(A135)
    state.players[1]!.resources.sheep = 8
    state.players[1]!.resources.boar = 8
    state.players[1]!.resources.cattle = 8

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(5)
  })

  it('grants the bonus to every qualifying player including the owner', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(A135)
    state.players[0]!.resources.sheep = 4
    state.players[0]!.resources.boar = 4
    state.players[0]!.resources.cattle = 4
    state.players[1]!.resources.sheep = 2
    state.players[1]!.resources.boar = 2
    state.players[1]!.resources.cattle = 2
    state.players[2]!.resources.sheep = 1
    state.players[2]!.resources.boar = 9
    state.players[2]!.resources.cattle = 9

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(5)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(1)
    expect(bonusVp(scores, state.players[2]!.id)).toBe(0)
  })
})

describe('C136_RanchProvost sharedScoring', () => {
  const makePasture = (
    id: string,
    size: number,
    stables: number,
    tiles: { row: number; col: number }[],
  ) => ({
    id,
    size,
    tiles,
    stables,
    animalType: null,
    animalCount: 0,
  })

  it('does not award the bonus when no player owns C136', () => {
    const state = setupThreePlayers()
    state.players[0]!.pastures = [makePasture('p1', 2, 0, [{ row: 1, col: 1 }, { row: 1, col: 2 }])]
    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(0)
  })

  it('awards 3 VP to the unique player with the largest pasture capacity', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(C136)
    state.players[0]!.pastures = [makePasture('p1', 2, 0, [{ row: 1, col: 1 }, { row: 1, col: 2 }])]
    state.players[1]!.pastures = [makePasture('p1', 1, 0, [{ row: 1, col: 1 }])]
    state.players[2]!.pastures = []

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(3)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(0)
    expect(bonusVp(scores, state.players[2]!.id)).toBe(0)
  })

  it('awards 3 VP to all tied leaders', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(C136)
    state.players[0]!.pastures = [makePasture('p1', 2, 0, [{ row: 1, col: 1 }, { row: 1, col: 2 }])]
    state.players[1]!.pastures = [makePasture('p1', 2, 0, [{ row: 1, col: 1 }, { row: 1, col: 2 }])]
    state.players[2]!.pastures = [makePasture('p1', 1, 0, [{ row: 1, col: 1 }])]

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(3)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(3)
    expect(bonusVp(scores, state.players[2]!.id)).toBe(0)
  })

  it('uses the highest-capacity pasture per player (stables boost capacity)', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(C136)
    // p0: size-1 pasture with 1 stable -> capacity 1 * 2 * 2 = 4
    state.players[0]!.pastures = [makePasture('p1', 1, 1, [{ row: 1, col: 1 }])]
    state.players[0]!.stableTiles = [{ row: 1, col: 1 }]
    // p1: size-2 pasture, no stable -> capacity 2 * 2 = 4
    state.players[1]!.pastures = [makePasture('p1', 2, 0, [{ row: 1, col: 1 }, { row: 1, col: 2 }])]
    // p2: size-1 plain -> capacity 2
    state.players[2]!.pastures = [makePasture('p1', 1, 0, [{ row: 1, col: 1 }])]

    const scores = computeScores(state)
    expect(bonusVp(scores, state.players[0]!.id)).toBe(3)
    expect(bonusVp(scores, state.players[1]!.id)).toBe(3)
    expect(bonusVp(scores, state.players[2]!.id)).toBe(0)
  })

  it('grants no bonus to players with no pasture', () => {
    const state = setupThreePlayers()
    state.players[0]!.occupationPlayed.push(C136)
    state.players[0]!.pastures = []
    state.players[1]!.pastures = []
    state.players[2]!.pastures = []

    const scores = computeScores(state)
    state.players.forEach((p) => {
      expect(bonusVp(scores, p.id)).toBe(0)
    })
  })
})
