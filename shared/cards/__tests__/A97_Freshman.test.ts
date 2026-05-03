import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { playOccupationAction } from '../../actions/effects/occupation'
import { actionDefinitions } from '../../actions'

import '../A/A97_Freshman'
import '../A/A123_FrameBuilder'
import type { CardListenerContext } from '../card-listeners'
import type { ActionExecutionContext } from '../../game/types'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
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
    occupationHand: [], occupationPlayed: ['A97_Freshman'],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    roundPhase: 'work',
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
    takenBy: [],
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
    } as unknown as CardListenerContext)

    expect(result?.decline).toBe(true)
    expect(result?.alternativeFlow).toEqual({
      type: 'seq',
      optional: true,
      promptKey: 'ui.interactionFreshmanOccupation',
      choiceLabelKey: 'ui.interactionFreshmanOccupation',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'A97_Freshman', params: { kind: 'set-flag', flag: true } },
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
    player.cardStates = { A97_Freshman: { flagged: true } }

    expect(resetListener).toBeDefined()
    expect(doableListener).toBeDefined()

    const result = executeCardListener(resetListener!, {
      state: createState(player),
      player,
      space: createSpace('place-farmer'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A97_Freshman',
      params: { kind: 'set-flag', flag: false },
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
      params: { costOverride: {} } as unknown as ActionExecutionContext,
    })

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return

    const resolved = playOccupationAction.resolveChoice!(
      {
        state: createState(player),
        player,
        space: createSpace('lessons'),
        params: { costOverride: {} } as unknown as ActionExecutionContext,
      },
      'A123_FrameBuilder',
    )

    // 7b1: play-occupation now returns seq:[pay, apply-occupation-play]; the
    // engine drives the actual mutate, so the resolveChoice unit-level call
    // returns a flow rather than mutating eagerly. The session-level test
    // (A97_Freshman session) verifies the end-to-end path.
    expect(resolved.type).toBe('flow')
    if (resolved.type !== 'flow') return
    const flow = resolved.flow as {
      type: 'seq'
      children: Array<{
        type: 'leaf'
        actionId: string
        params: Record<string, unknown>
      }>
    }
    expect(flow.type).toBe('seq')
    expect(flow.children.map((c) => c.actionId)).toEqual(['pay', 'apply-occupation-play'])
    expect(flow.children[1]!.params).toEqual({ occupationId: 'A123_FrameBuilder' })
  })
})
