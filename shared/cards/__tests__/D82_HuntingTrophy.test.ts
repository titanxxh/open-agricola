import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import { D082_HuntingTrophy_impl } from '../D/D082_HuntingTrophy'

const CARD_ID = 'D082_HuntingTrophy'

const resources = {
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
}

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: { ...resources },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [CARD_ID],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 6,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { ...resources },
    takenBy: [],
  }) as ActionSpace

const makeContext = (
  player: PlayerState,
  spaceId: string,
  actionId: string,
  phase: CardListenerContext['phase'],
  extra: Partial<CardListenerContext> = {},
): CardListenerContext =>
  ({
    state: createState(player),
    player,
    space: createSpace(spaceId),
    actionId,
    phase,
    ...extra,
  }) as CardListenerContext

const findListener = (id: string) =>
  D082_HuntingTrophy_impl.listeners.find((listener) => listener.id === id)!

describe('D082_HuntingTrophy listeners', () => {
  it('place-farmer listeners do not mutate flags or active modifiers', () => {
    const player = createPlayer()
    const before = JSON.stringify({
      cardStates: player.cardStates,
      activeModifiers: player.activeModifiers,
    })

    const placeFarmerListeners = D082_HuntingTrophy_impl.listeners.filter(
      (entry) => entry.actions?.includes('place-farmer'),
    )
    expect(placeFarmerListeners).toHaveLength(0)

    for (const listener of placeFarmerListeners) {
      const spaceId = listener.id.includes('farm') ? 'farm-redevelopment' : 'house-redevelopment'
      listener.handler(makeContext(player, spaceId, 'place-farmer', listener.phases![0]!))
    }

    expect(JSON.stringify({
      cardStates: player.cardStates,
      activeModifiers: player.activeModifiers,
    })).toBe(before)
  })

  it('improvement discount is scoped to house-redevelopment space without flags', () => {
    const player = createPlayer()
    const listener = findListener('D82-hunting-trophy-improvement-compute-costs')

    const outside = listener.handler(
      makeContext(player, 'improvement', 'improvement', 'computeCosts'),
    )
    expect(outside).toBeUndefined()

    const result = listener.handler(
      makeContext(player, 'house-redevelopment', 'improvement', 'computeCosts'),
    )

    expect(player.cardStates?.[CARD_ID]?.flagged).toBeUndefined()
    expect(result?.bonuses).toHaveLength(1)
    expect(result?.bonuses?.[0]?.optional).toBe(false)
    expect(result?.bonuses?.[0]?.choices?.map((choice) => Object.keys(choice.discount)[0]).sort()).toEqual([
      'clay',
      'reed',
      'stone',
      'wood',
    ])
  })

  it('farm-redevelopment fencing discount exposes cost and doability without active modifiers', () => {
    const player = createPlayer()
    player.resources.wood = 1

    const costListener = findListener('D82-hunting-trophy-farm-redevelopment-fence-compute-costs')
    const doableListener = findListener('D82-hunting-trophy-farm-redevelopment-fence-isdoable')

    expect(costListener.handler(
      makeContext(player, 'fencing', 'fence', 'computeCosts'),
    )).toBeUndefined()

    expect(costListener.handler(
      makeContext(player, 'farm-redevelopment', 'fence', 'computeCosts'),
    )?.trades).toEqual([
      {
        from: {},
        to: { wood: 1 },
        max: 3,
        scope: 'action',
        sourceId: CARD_ID,
      },
    ])

    const result = doableListener.handler(
      makeContext(player, 'farm-redevelopment', 'fence', 'isDoable', { doable: false }),
    )

    expect(result?.doable).toBe(true)
    expect(player.activeModifiers).toEqual([])
  })
})
