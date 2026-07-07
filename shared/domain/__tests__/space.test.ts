import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, WorkerRef } from '../../contract/types'
import {
  addSyntheticLinkedOccupancyRef,
  addWorkerRef,
  filterActionSpacesByIds,
  findActionSpaceById,
  findActionSpaceByWorker,
  hasActionSpace,
  isSpaceOccupied,
  isSyntheticLinkedOccupancy,
  removeSyntheticLinkedOccupancyRefs,
  removeWorkerRef,
  spaceHasPlayer,
  spaceOccupantCount,
} from '../space'
import { mkActionSpace } from '../../cards/__tests__/fixtures'

const mkSpace = (takenBy: WorkerRef[] = []): ActionSpace => mkActionSpace({ id: 'x', takenBy })
const mkState = (spaces: ActionSpace[]): Pick<GameState, 'actionSpaces'> => ({ actionSpaces: spaces })

describe('space helpers', () => {
  it('findActionSpaceById returns the matching action space', () => {
    const forest = mkActionSpace({ id: 'forest' })
    const clayPit = mkActionSpace({ id: 'clay-pit' })
    const state = mkState([forest, clayPit])

    expect(findActionSpaceById(state, 'clay-pit')).toBe(clayPit)
    expect(findActionSpaceById(state, 'missing')).toBeUndefined()
    expect(findActionSpaceById(state, null)).toBeUndefined()
  })

  it('hasActionSpace checks action-space presence by id', () => {
    const state = mkState([mkActionSpace({ id: 'forest' })])

    expect(hasActionSpace(state, 'forest')).toBe(true)
    expect(hasActionSpace(state, 'missing')).toBe(false)
  })

  it('filterActionSpacesByIds keeps board order and drops unknown ids', () => {
    const forest = mkActionSpace({ id: 'forest' })
    const clayPit = mkActionSpace({ id: 'clay-pit' })
    const reedBank = mkActionSpace({ id: 'reed-bank' })
    const state = mkState([forest, clayPit, reedBank])

    expect(filterActionSpacesByIds(state, ['reed-bank', 'missing', 'forest'])).toEqual([
      forest,
      reedBank,
    ])
  })

  it('findActionSpaceByWorker returns the first space hosting a worker ref', () => {
    const forest = mkActionSpace({
      id: 'forest',
      takenBy: [{ playerId: 'p1', workerId: '1' }],
    })
    const clayPit = mkActionSpace({
      id: 'clay-pit',
      takenBy: [{ playerId: 'p1', workerId: '2' }],
    })
    const state = mkState([forest, clayPit])

    expect(findActionSpaceByWorker(state, 'p1')).toBe(forest)
    expect(findActionSpaceByWorker(state, 'p1', '2')).toBe(clayPit)
    expect(findActionSpaceByWorker(state, 'p2')).toBeUndefined()
  })

  it('isSpaceOccupied returns true iff takenBy non-empty', () => {
    expect(isSpaceOccupied(mkSpace([]))).toBe(false)
    expect(isSpaceOccupied(mkSpace([{ playerId: 'p1', workerId: '1' }]))).toBe(true)
  })

  it('spaceOccupantCount returns array length', () => {
    expect(spaceOccupantCount(mkSpace([]))).toBe(0)
    expect(spaceOccupantCount(mkSpace([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p2', workerId: '1' },
    ]))).toBe(2)
  })

  it('spaceHasPlayer matches any entry with that playerId', () => {
    const s = mkSpace([{ playerId: 'p1', workerId: '3' }])
    expect(spaceHasPlayer(s, 'p1')).toBe(true)
    expect(spaceHasPlayer(s, 'p2')).toBe(false)
  })

  it('addWorkerRef appends to takenBy', () => {
    const s = mkSpace([])
    addWorkerRef(s, 'p1', '1')
    addWorkerRef(s, 'p2', '2')
    expect(s.takenBy).toEqual([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p2', workerId: '2' },
    ])
  })

  it('removeWorkerRef removes first match by playerId', () => {
    const s = mkSpace([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p2', workerId: '1' },
    ])
    const removed = removeWorkerRef(s, 'p1')
    expect(removed).toEqual({ playerId: 'p1', workerId: '1' })
    expect(s.takenBy).toEqual([{ playerId: 'p2', workerId: '1' }])
  })

  it('removeWorkerRef by exact (playerId, workerId)', () => {
    const s = mkSpace([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p1', workerId: '2' },
    ])
    removeWorkerRef(s, 'p1', '2')
    expect(s.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
  })

  it('removeWorkerRef returns null when no match', () => {
    const s = mkSpace([{ playerId: 'p1', workerId: '1' }])
    expect(removeWorkerRef(s, 'p2')).toBe(null)
  })

  it('adds and recognizes synthetic linked occupancy metadata', () => {
    const s = mkSpace([])
    addSyntheticLinkedOccupancyRef(s, 'p1', '1', 'C023_JobContract')

    expect(s.takenBy).toEqual([{
      playerId: 'p1',
      workerId: '1',
      synthetic: {
        kind: 'linked-occupancy',
        sourceCard: 'C023_JobContract',
        linkedWorkerId: '1',
      },
    }])
    expect(isSyntheticLinkedOccupancy(s.takenBy[0], {
      sourceCard: 'C023_JobContract',
      linkedWorkerId: '1',
    })).toBe(true)
  })

  it('removes only matching synthetic linked occupancy refs', () => {
    const s = mkSpace([{ playerId: 'p1', workerId: '4' }])
    addSyntheticLinkedOccupancyRef(s, 'p1', '1', 'C023_JobContract')
    addSyntheticLinkedOccupancyRef(s, 'p1', '2', 'C023_JobContract')
    addSyntheticLinkedOccupancyRef(s, 'p2', '1', 'C023_JobContract')

    removeSyntheticLinkedOccupancyRefs(s, 'p1', '1')

    expect(s.takenBy).toEqual([
      { playerId: 'p1', workerId: '4' },
      {
        playerId: 'p1',
        workerId: '2',
        synthetic: {
          kind: 'linked-occupancy',
          sourceCard: 'C023_JobContract',
          linkedWorkerId: '2',
        },
      },
      {
        playerId: 'p2',
        workerId: '1',
        synthetic: {
          kind: 'linked-occupancy',
          sourceCard: 'C023_JobContract',
          linkedWorkerId: '1',
        },
      },
    ])
  })
})
