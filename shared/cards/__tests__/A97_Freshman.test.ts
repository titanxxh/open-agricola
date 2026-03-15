import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { playOccupationAction } from '../../actions/effects/occupation'
import { actionDefinitions } from '../../actions'

import '../A/A97_Freshman'
import '../A/A123_FrameBuilder'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: ['A97_Freshman'], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    phase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
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
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((listener) => listener.id === id)
const grainUtilization = actionDefinitions.find((action) => action.id === 'grain-utilization')!

describe('A97_Freshman', () => {
  it('makes grain utilization doable through bake replacement', () => {
    const player = createPlayer()
    player.occupationHand = ['A123_FrameBuilder']

    expect(grainUtilization.canBeExecutedByPlayer(createState(player), player)).toBe(true)
  })

  it('returns optional replace flow that flags card and plays occupation for free', () => {
    const listener = findListener('A97-freshman-replace-bake')
    const player = createPlayer()
    player.occupationHand = ['A123_FrameBuilder']

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('grain-utilization'),
      actionId: 'bake-bread',
      phase: 'computeReplace',
    } as any)

    expect(result?.decline).toBe(true)
    expect(result?.alternativeFlow).toEqual({
      type: 'seq',
      optional: true,
      promptKey: 'ui.interactionFreshmanOccupation',
      children: [
        { type: 'leaf', actionId: 'flag-card', sourceCard: 'A97_Freshman' },
        { type: 'leaf', actionId: 'mark-card-trigger', sourceCard: 'A97_Freshman' },
        {
          type: 'leaf',
          actionId: 'play-occupation',
          sourceCard: 'A97_Freshman',
          params: { costOverride: {} },
        },
      ],
    })
  })

  it('registers reset and isDoable listeners around the replace hook', () => {
    const resetListener = findListener('A97-freshman-after-place-farmer')
    const doableListener = findListener('A97-freshman-isdoable-bake')
    const player = createPlayer()
    player.occupationHand = ['A123_FrameBuilder']
    player.cardStates = { A97_Freshman: { flagged: true, counters: { triggerCount: 1 } } }

    expect(resetListener).toBeDefined()
    expect(doableListener).toBeDefined()

    const result = executeCardListener(resetListener!, {
      state: createState(player),
      player,
      space: createSpace('place-farmer'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'unflag-card',
      sourceCard: 'A97_Freshman',
    })
  })

  it('lets play-occupation ignore normal lessons cost when Freshman provides free play', () => {
    const player = createPlayer()
    player.occupationPlayed.push('A55_JunkRoom')
    player.occupationHand = ['A123_FrameBuilder']

    const result = playOccupationAction.execute({
      state: createState(player),
      player,
      space: createSpace('lessons'),
      params: { costOverride: {} } as any,
    })

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return

    const resolved = playOccupationAction.resolveChoice!(
      {
        state: createState(player),
        player,
        space: createSpace('lessons'),
        params: { costOverride: {} } as any,
      },
      'A123_FrameBuilder',
    )

    expect(resolved.type).toBe('ok')
    expect(player.occupationPlayed).toContain('A123_FrameBuilder')
    expect(player.resources.food).toBe(0)
  })
})
