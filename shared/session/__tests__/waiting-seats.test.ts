import { describe, expect, it } from 'vitest'
import { playingActorIndex, waitingSeatIndexes } from '../waiting-seats'

const players = [
  { id: 'a', name: 'Alice', color: 'red' },
  { id: 'b', name: 'Bob', color: 'blue' },
]

describe('waitingSeatIndexes', () => {
  it('lists every seat that has not submitted the current draft stage', () => {
    const state = {
      phase: 'draft',
      players,
      draft: {
        stage: 'occupation',
        pendingPicks: { a: { occ: 'occ-a', minor: null }, b: { occ: null, minor: null } },
      },
    }
    expect(waitingSeatIndexes('playing', state, [0, 1], null)).toEqual([1])
  })

  it('lists seats that have not chosen parents', () => {
    const state = {
      phase: 'parent-selection',
      players,
      parentSelection: { submissions: { a: { mother: 'PR01', father: 'PS01' }, b: null } },
    }
    expect(waitingSeatIndexes('playing', state, [0, 1], null)).toEqual([1])
  })

  it('lists only the ordinary-play actor', () => {
    expect(waitingSeatIndexes('playing', { phase: 'playing', players }, [0, 1], 0)).toEqual([0])
    expect(waitingSeatIndexes('playing', { phase: 'solo-hand-selection', players }, [0, 1], 0)).toEqual([])
    expect(waitingSeatIndexes('waiting', { phase: 'playing', players }, [0, 1], 0)).toEqual([])
  })

  it('skips seats that are empty or have no display color', () => {
    const state = {
      phase: 'playing',
      players: [...players, { id: 'c', name: 'Cara' }],
    }
    expect(waitingSeatIndexes('playing', state, [0], 0)).toEqual([0])
    expect(waitingSeatIndexes('playing', state, [2], 2)).toEqual([])
  })
})

describe('playingActorIndex', () => {
  it('uses the frame owner during play and nobody once the game is over', () => {
    expect(playingActorIndex('playing', false, 1, 0)).toBe(1)
    expect(playingActorIndex('playing', false, null, 0)).toBe(0)
    expect(playingActorIndex('playing', true, 1, 0)).toBeNull()
    expect(playingActorIndex('draft', false, 1, 0)).toBeNull()
  })
})
