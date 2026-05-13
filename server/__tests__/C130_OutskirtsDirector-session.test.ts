import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import { markAllWorkersUsed } from '../../shared/domain/player'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import '../../shared/cards/C/C130_OutskirtsDirector'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C130_OutskirtsDirector'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as PlayerState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const createState = (player: PlayerState): GameState => {
  const groveSpace = createSpace('grove')
  const hollowSpace = createSpace('hollow-4')
  return {
    round: 1, currentPlayerIndex: 0, players: [player],
    actionSpaces: [groveSpace, hollowSpace], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  } as GameState
}

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C130_OutskirtsDirector', () => {
  it('returns a special-effect flow that places 2 reed on hollow-4 when using grove', () => {
    const listener = findListener('C130-outskirts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const groveSpace = state.actionSpaces.find(s => s.id === 'grove')!
    const hollowSpace = state.actionSpaces.find(s => s.id === 'hollow-4')!

    expect(hollowSpace.resources.reed).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: groveSpace,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(hollowSpace.resources.reed).toBe(0)
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0]).toMatchObject({
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'hollow-4', resource: 'reed', amount: 2 },
    })
    expect(children[1]).toMatchObject({ actionId: 'place-farmer', optional: true })

    specialEffectAction.execute({
      state,
      player,
      space: groveSpace,
      sourceCard: CARD_ID,
      params: (children[0] as Extract<ActionFlow, { type: 'leaf' }>).params,
    })
    expect(hollowSpace.resources.reed).toBe(2)
  })

  it('returns a special-effect flow that places 2 reed on grove when using hollow-4', () => {
    const listener = findListener('C130-outskirts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const groveSpace = state.actionSpaces.find(s => s.id === 'grove')!
    const hollowSpace = state.actionSpaces.find(s => s.id === 'hollow-4')!

    expect(groveSpace.resources.reed).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: hollowSpace,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(groveSpace.resources.reed).toBe(0)
    expect(result?.flow?.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0]).toMatchObject({
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'grove', resource: 'reed', amount: 2 },
    })
    expect(children[1]).toMatchObject({ actionId: 'place-farmer', optional: true })
  })

  it('returns only the add-resource leaf when no workers are available', () => {
    const listener = findListener('C130-outskirts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    markAllWorkersUsed(state, player)

    const result = executeCardListener(listener!, {
      state, player, space: state.actionSpaces.find(s => s.id === 'grove')!,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'hollow-4', resource: 'reed', amount: 2 },
    })
    expect(state.actionSpaces.find(s => s.id === 'hollow-4')!.resources.reed).toBe(0)
  })

  it('does not trigger on unrelated spaces', () => {
    const listener = findListener('C130-outskirts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  // 3p variant: grove + hollow (no hollow-4)
  it('3p variant: places 2 reed on hollow when using grove', () => {
    const listener = findListener('C130-outskirts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const groveSpace = createSpace('grove')
    const hollowSpace = createSpace('hollow')
    const state = {
      round: 1, currentPlayerIndex: 0, players: [player],
      actionSpaces: [groveSpace, hollowSpace], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as unknown as GameState

    expect(hollowSpace.resources.reed).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: groveSpace,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(hollowSpace.resources.reed).toBe(0)
    expect(result?.flow?.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0]).toMatchObject({
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'hollow', resource: 'reed', amount: 2 },
    })
    expect(children[1]).toMatchObject({ actionId: 'place-farmer', optional: true })
  })

  it('3p variant: places 2 reed on grove when using hollow', () => {
    const listener = findListener('C130-outskirts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const groveSpace = createSpace('grove')
    const hollowSpace = createSpace('hollow')
    const state = {
      round: 1, currentPlayerIndex: 0, players: [player],
      actionSpaces: [groveSpace, hollowSpace], log: [], roundStartSnapshot: null,
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as unknown as GameState

    expect(groveSpace.resources.reed).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: hollowSpace,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(groveSpace.resources.reed).toBe(0)
    expect(result?.flow?.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0]).toMatchObject({
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'grove', resource: 'reed', amount: 2 },
    })
    expect(children[1]).toMatchObject({ actionId: 'place-farmer', optional: true })
  })
})
