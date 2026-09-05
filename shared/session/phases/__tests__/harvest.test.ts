import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types.ts'
import { getBeforeHarvestPlayerIndices, getHarvestPlayerIndices } from '../harvest.ts'

const makeState = (players: PlayerState[]): GameState =>
  ({ players, actionSpaces: [] } as unknown as GameState)

const player = (id: string, startPlayer = false): PlayerState =>
  ({ id, name: id, startPlayer } as unknown as PlayerState)

describe('harvest phase helpers', () => {
  it('orders seats starting from startPlayer', () => {
    const state = makeState([player('p0'), player('p1', true), player('p2')])
    expect(getHarvestPlayerIndices(state)).toEqual([1, 2, 0])
  })

  it('falls back to seat 0 when no startPlayer flag set', () => {
    const state = makeState([player('p0'), player('p1'), player('p2')])
    expect(getHarvestPlayerIndices(state)).toEqual([0, 1, 2])
  })

  it('keeps harvest-skipping players in the Before-Harvest order', () => {
    const state = makeState([player('p0'), player('p1', true), player('p2')])
    state.round = 4
    state.roundPhase = 'harvest'
    state.players[1]!.cardStates = {
      TEST_Skip: { extraData: { skipHarvestRound: 4 } },
    }

    expect(getBeforeHarvestPlayerIndices(state)).toEqual([1, 2, 0])
    expect(getHarvestPlayerIndices(state)).toEqual([2, 0])
  })
})
