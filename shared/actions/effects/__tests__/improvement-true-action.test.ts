import { describe, expect, it } from 'vitest'
import { improvementAnyAction } from '../improvement'
import type {
  ActionExecutionContext,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const makePlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    resources: { ...emptyResources(), clay: 3 },
    improvements: [],
    minorPlayed: [],
    minorHand: [],
    occupationHand: [],
    occupationPlayed: [],
    activeModifiers: [],
    cardStates: {},
    fields: [],
    pastures: [],
    roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stableTiles: [],
    stables: 0,
    rooms: 2,
    houseType: 'wood',
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
  } as unknown as PlayerState)

const makeState = (player: PlayerState): GameState =>
  ({
    players: [player],
    currentPlayerIndex: 0,
    round: 1,
    actionSpaces: [],
    availableMajorImprovements: ['Major_ClayOven'],
    log: [],
  } as unknown as GameState)

const makeSpace = (): ActionSpace =>
  ({
    id: 'improvement',
    nameKey: 'actions.improvement.name',
    canBeExecutedByPlayer: () => true,
  } as unknown as ActionSpace)

const resolve = (
  params: Record<string, unknown>,
  actionContext: Record<string, unknown> = {},
) => {
  const player = makePlayer()
  const state = makeState(player)
  const ctx: ActionExecutionContext = {
    state,
    player,
    space: makeSpace(),
    params,
    sourceCard: 'C60_SmallPottersOven',
    actionContext,
  }
  return improvementAnyAction.resolveChoice!(ctx, 'major:Major_ClayOven')
}

describe('improvement trueAction context', () => {
  it('propagates params.trueAction=false to the generated payment and apply leaves', () => {
    const result = resolve({
      allowedPurchases: ['Major_ClayOven'],
      trueAction: false,
    })

    expect(result.type).toBe('flow')
    const flow = (result as { type: 'flow'; flow: ActionFlow }).flow
    expect(flow).toMatchObject({
      type: 'seq',
      children: [
        {
          actionId: 'pay',
          actionContext: {
            costType: 'major-improvement',
            improvementKind: 'major',
            trueAction: false,
          },
        },
        {
          actionId: 'apply-improvement',
          params: { improvementId: 'Major_ClayOven', kind: 'major' },
          actionContext: { trueAction: false },
        },
      ],
    })
  })

  it('propagates actionContext.trueAction=false to the generated payment and apply leaves', () => {
    const result = resolve({ allowedPurchases: ['Major_ClayOven'] }, { trueAction: false })

    expect(result.type).toBe('flow')
    const flow = (result as { type: 'flow'; flow: ActionFlow }).flow
    expect(flow).toMatchObject({
      type: 'seq',
      children: [
        {
          actionId: 'pay',
          actionContext: {
            trueAction: false,
          },
        },
        {
          actionId: 'apply-improvement',
          actionContext: { trueAction: false },
        },
      ],
    })
  })
})
