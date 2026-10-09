import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { computeScores } from '../../shared/domain/scoring'
import { expectSharedBonuses, setupSharedScoring } from './_helpers/batch07-shared-scoring'

import '../../shared/cards/C/C135_Constable'
import '../../shared/cards/B/B040_BreweryPond'
import type { ActionFlow } from '../../shared/contract/types'

// The reference map (key = 14 - turn = remaining complete rounds left after this one):
//   0→0, 1→1, 2→1, 3→2, 4→2, 5→2, 6→3, 7→3, 8→3,
//   9→4, 10→4, 11→4, 12→4, 13→4, 14→4
// onBuy fires when turn (= state.round) < 14.
const expectedWoodForRound = (round: number): number => {
  if (round >= 14) return 0
  const remaining = 14 - round
  const map: Record<number, number> = {
    0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3,
    9: 4, 10: 4, 11: 4, 12: 4, 13: 4, 14: 4,
  }
  return map[remaining] ?? 0
}

describe('C135_Constable — onBuy gain wood by remaining rounds', () => {
  const setup = (round: number) => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    const player = state.players[0]!
    player.occupationHand.push('C135_Constable')
    player.resources.food = 5
    session.loadState(state)
    return session
  }

  it('round 1 (remaining 13): +4 wood', () => {
    const session = setup(1)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: expectedWoodForRound(1) })
  })

  it('round 11 (remaining 3): +2 wood', () => {
    const session = setup(11)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 2 })
  })

  it('round 13 (remaining 1): +1 wood', () => {
    const session = setup(13)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('round 14 (no rounds left): no flow', () => {
    const session = setup(14)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).toBeNull()
  })

  it('round 6 (remaining 8): +3 wood', () => {
    const session = setup(6)
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C135_Constable', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ wood: 3 })
  })
})

describe('C135_Constable — shared scoring', () => {
  it.each([
    { eligible: [true, true, false], expected: [3, 3, 0] },
    { eligible: [false, true, true], expected: [0, 3, 3] },
  ])('scores each eligible player independently of ownership: $eligible', ({ eligible, expected }) => {
    const session = setupSharedScoring('C135_Constable')
    session.state.players.forEach((player, index) => {
      player.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
      ]
      player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
      player.rooms = 2
      const pastureTiles = [
        { row: 0, col: 4 },
        ...Array.from({ length: 10 }, (_, tile) => ({ row: 1 + Math.floor(tile / 5), col: tile % 5 })),
      ]
      player.pastures = [{
        id: `complete-${index}`, size: pastureTiles.length, tiles: pastureTiles,
        stables: 0, animalType: 'sheep', animalCount: 1,
      }]
      Object.assign(player.resources, {
        grain: 1, vegetable: 1, sheep: 1, boar: 1, cattle: 1,
        begging: eligible[index] ? 0 : 1,
      })
    })
    session.loadState(session.state)
    expectSharedBonuses(session, 'C135_Constable', expected)
  })

  it('awards every player without a negative scoring category', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('C135_Constable')
    state.players.forEach((player) => {
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ]
      player.roomTiles = Array.from({ length: 15 }, (_, index) => ({
        row: Math.floor(index / 5),
        col: index % 5,
      }))
      player.rooms = 15
      player.pastures = [{
        id: 'complete-farm',
        size: 1,
        tiles: [{ row: 2, col: 4 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 1,
      }]
      player.resources = { ...player.resources, grain: 1, vegetable: 1, sheep: 1, boar: 1, cattle: 1, begging: 0 }
    })
    state.players[2]!.resources.begging = 1

    const scores = computeScores(state)
    const bonus = (index: number) => scores[index]!.categories
      .find((category) => category.key === 'cardBonusVp')?.entries
      .find((entry) => entry.type === 'bonus' && entry.cardId === 'C135_Constable')?.score ?? 0

    expect(bonus(0)).toBe(3)
    expect(bonus(1)).toBe(3)
    expect(bonus(2)).toBe(0)
  })

  it('rejects a player with a negative entry even when a positive card offsets the category total', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push('C135_Constable')
    state.players.forEach((player) => {
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ]
      player.roomTiles = Array.from({ length: 15 }, (_, index) => ({
        row: Math.floor(index / 5),
        col: index % 5,
      }))
      player.rooms = 15
      player.pastures = [{
        id: 'complete-farm', size: 1, tiles: [{ row: 2, col: 4 }],
        stables: 0, animalType: 'sheep', animalCount: 1,
      }]
      Object.assign(player.resources, {
        grain: 1, vegetable: 1, sheep: 1, boar: 1, cattle: 1, begging: 0,
      })
    })
    state.players[1]!.improvements.push('Major_Well')
    state.players[1]!.minorPlayed.push('B040_BreweryPond')

    const scores = computeScores(state)
    const cardEntries = scores[1]!.categories.find((category) => category.key === 'cards')!.entries
    expect(cardEntries.map((entry) => entry.score)).toEqual(expect.arrayContaining([4, -1]))
    const constableBonus = scores[1]!.categories
      .flatMap((category) => category.entries)
      .find((entry) => entry.type === 'bonus' && entry.cardId === 'C135_Constable')
    expect(constableBonus).toBeUndefined()
  })
})
