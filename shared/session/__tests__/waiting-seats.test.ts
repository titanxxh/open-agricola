import { describe, expect, it } from 'vitest'
import { playingActorIndex, waitingSeatIndexes } from '../waiting-seats'
import { initStagedDraftState, processSubmit } from '../../draft/draft-manager'
import { firstDraftPick } from '../../draft/__tests__/draft-fixtures'

const players = [
  { id: 'a', name: 'Alice', color: 'red' },
  { id: 'b', name: 'Bob', color: 'blue' },
]

describe('waitingSeatIndexes', () => {
  it('lists current packet owners and excludes a seat waiting for its next packet', () => {
    const draft = initStagedDraftState(['a', 'b'], [{ kind: 'occupation', poolSize: 3, totalRounds: 2, pools: {
      a: { occ: ['a1', 'a2', 'a3'], minor: [] }, b: { occ: ['b1', 'b2', 'b3'], minor: [] },
    } }])
    const state = { phase: 'draft', players, draft }
    expect(waitingSeatIndexes('playing', state, [0, 1], null)).toEqual([0, 1])
    const result = processSubmit(draft, 'a', firstDraftPick(draft, 'a'))
    if (result.kind !== 'accepted') throw new Error(result.error)
    state.draft = result.draft
    expect(waitingSeatIndexes('playing', state, [0, 1], null)).toEqual([1])
  })

  it('finds actionable seats across different personal stages and excludes finished seats', () => {
    let draft = initStagedDraftState(['a', 'b'], [
      { kind: 'occupation', poolSize: 3, totalRounds: 2, pools: {
        a: { occ: ['a1', 'a2', 'a3'], minor: [] }, b: { occ: ['b1', 'b2', 'b3'], minor: [] },
      } },
      { kind: 'publishedMinor', poolSize: 3, totalRounds: 1, pools: {
        a: { occ: [], minor: ['m1', 'm2', 'm3'] }, b: { occ: [], minor: ['n1', 'n2', 'n3'] },
      } },
    ])
    for (const id of ['a', 'b', 'a']) {
      const result = processSubmit(draft, id, firstDraftPick(draft, id))
      if (result.kind !== 'accepted') throw new Error(result.error)
      draft = result.draft
    }
    expect(waitingSeatIndexes('playing', { phase: 'draft', players, draft }, [0, 1], null)).toEqual([0, 1])
    const result = processSubmit(draft, 'a', firstDraftPick(draft, 'a'))
    if (result.kind !== 'accepted') throw new Error(result.error)
    expect(waitingSeatIndexes('playing', { phase: 'draft', players, draft: result.draft }, [0, 1], null)).toEqual([1])
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
