import { describe, expect, it } from 'vitest'
import { improvementAction } from '../improvement'
import type {
  ActionExecutionContext,
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
  return improvementAction.resolveChoice!(ctx, 'major:Major_ClayOven')
}

describe('improvement trueAction context', () => {
  it('propagates params.trueAction=false to the generated payment and activation leaves', () => {
    const result = resolve({
      allowedPurchases: ['Major_ClayOven'],
      trueAction: false,
    })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.internalChildren?.beforeHostListeners).toMatchObject([
      {
        actionId: 'pay',
        actionContext: {
          costType: 'major-improvement',
          improvementKind: 'major',
          trueAction: false,
        },
        resultKey: 'payment',
      },
    ])
    expect(result.internalChildren?.afterHostListeners).toMatchObject([
      {
        actionId: 'activate-card-effect',
        params: { cardId: 'Major_ClayOven', hook: 'onBuy' },
        paymentInfoFrom: 'payment',
      },
    ])
    expect(result.internalChildren?.beforeHostListeners).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ actionId: 'apply-improvement' })]),
    )
  })

  it('propagates actionContext.trueAction=false to the generated payment and activation leaves', () => {
    const result = resolve({ allowedPurchases: ['Major_ClayOven'] }, { trueAction: false })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.internalChildren?.beforeHostListeners).toMatchObject([
      {
        actionId: 'pay',
        actionContext: {
          trueAction: false,
        },
        resultKey: 'payment',
      },
    ])
    expect(result.internalChildren?.afterHostListeners).toMatchObject([
      {
        actionId: 'activate-card-effect',
        paymentInfoFrom: 'payment',
      },
    ])
    expect(result.internalChildren?.beforeHostListeners).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ actionId: 'apply-improvement' })]),
    )
  })
})
