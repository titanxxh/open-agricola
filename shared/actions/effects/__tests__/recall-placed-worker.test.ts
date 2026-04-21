import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../../game/types'
import { recallPlacedWorkerAction } from '../recall-placed-worker'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { getWorkerHeldOnCard } from '../../../cards/helpers/card-held-workers'
import { workersAvailable } from '../../../game/player'
import type { ActionExecutionContext } from '../../../game/types'

const mkSpace = (id: string, takenBy: { playerId: string; workerId: string }[] = []): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy,
  }) as unknown as ActionSpace

const mkPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'p1',
    color: 'red',
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    cardStates: {},
    resources: {},
  }) as unknown as PlayerState

const mkState = (spaces: ActionSpace[], players: PlayerState[]): GameState =>
  ({
    actionSpaces: spaces,
    players,
    log: [],
    round: 1,
    currentPlayerIndex: 0,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('recall-placed-worker — forceFirst + targetCardHold', () => {
  it('recalls the first-placed worker onto the target card (worker held, not at home)', () => {
    const forest = mkSpace('forest', [{ playerId: 'p1', workerId: '1' }])
    const p = mkPlayer()
    const s = mkState([forest], [p])
    recordRoundPlacement(p, 'forest', '1')

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: forest,
      params: { forceFirst: true, targetCardHold: 'C22_BasketChair' },
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('ok')
    expect(forest.takenBy).toEqual([])
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBe('1')
    // 2 active workers minus 1 held = 1 at home
    expect(workersAvailable(s, p)).toBe(1)
  })

  it('forceFirst fails when no placements were recorded this round', () => {
    const p = mkPlayer()
    const s = mkState([], [p])

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: { id: 'dummy' } as ActionSpace,
      params: { forceFirst: true, targetCardHold: 'C22_BasketChair' },
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('fail')
  })

  it('forceFirst fails when the first placement is on a meeting-place space', () => {
    const mp = mkSpace('meeting-place-family', [{ playerId: 'p1', workerId: '1' }])
    const p = mkPlayer()
    const s = mkState([mp], [p])
    recordRoundPlacement(p, 'meeting-place-family', '1')

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: mp,
      params: { forceFirst: true, targetCardHold: 'C22_BasketChair' },
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('fail')
    // No recall happened.
    expect(mp.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('forceFirst without targetCardHold returns the worker to home (legacy behavior)', () => {
    const forest = mkSpace('forest', [{ playerId: 'p1', workerId: '1' }])
    const p = mkPlayer()
    const s = mkState([forest], [p])
    recordRoundPlacement(p, 'forest', '1')

    const result = recallPlacedWorkerAction.execute({
      state: s,
      player: p,
      space: forest,
      params: { forceFirst: true },
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('ok')
    expect(forest.takenBy).toEqual([])
    // No card hold; worker is at home again.
    expect(workersAvailable(s, p)).toBe(2)
  })
})
