import { describe, expect, it } from 'vitest'
import type { ActionDefinition, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import { CardRegistry } from '../../../cards/registry'
import { getActiveCardRegistry, setActiveCardRegistry } from '../../../cards/active-registry'
import { B155_ArtTeacher_impl } from '../../../cards/B/B155_ArtTeacher'
import { Engine } from '../../../engine/engine'
import { EngineTree } from '../../../engine/tree'
import { HookDispatcher } from '../../../engine/dispatcher'
import { LogStore } from '../../../engine/log-store'
import { ActionNode, SequenceNode } from '../../../engine/nodes'
import { ActionRegistry } from '../../../engine/registry'
import { internalActionDefinitions } from '../../internal-actions'
import { playOccupation } from '../occupation'
import '../../../cards/A/A85_Homekeeper'
import '../../../cards/C/C107_Baker'

const FLOW_CARD_ID = 'C107_Baker'
const OK_CARD_ID = 'A85_Homekeeper'
const SELF_AFTER_CARD_ID = 'B155_ArtTeacher'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: ['Major_Fireplace1'],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
})

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
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
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    extraOccupationsFromCards: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
    ...overrides,
  }) as PlayerState

const createSpace = (id = 'lessons'): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    canBeExecutedByPlayer: () => true,
  }) as ActionSpace

const buildEngine = (actions: ActionDefinition[], hostActionId: string) => {
  const registry = new ActionRegistry()
  actions.forEach((action) => registry.register(action))
  return new Engine({
    tree: new EngineTree(new SequenceNode(`sequence-${hostActionId}`, [
      new ActionNode(`action-${hostActionId}`, hostActionId),
    ])),
    registry,
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })
}

const proceedUntilDone = (
  engine: Engine,
  context: { state: GameState; player: PlayerState; space: ActionSpace },
) => {
  let step = engine.proceed(context)
  let guard = 20
  while (guard-- > 0 && step.type === 'ok') {
    step = engine.proceed(context)
  }
  return step
}

describe('occupation play result', () => {
  it('plays plain occupation without legacy log payload', () => {
    const player = createPlayer({
      occupationHand: [OK_CARD_ID],
      resources: {
        wood: 0,
        clay: 0,
        reed: 0,
        stone: 0,
        food: 1,
        grain: 0,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
    })

    const result = playOccupation(player, OK_CARD_ID, { food: 1 })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(player.occupationPlayed).toContain(OK_CARD_ID)
    expect(player.resources.food).toBe(0)
  })

  it('returns flow without legacy log payload', () => {
    const state = createState()
    const player = createPlayer({
      occupationHand: [FLOW_CARD_ID],
      _activeActionBonusSources: ['D95_SiteManager'],
      resources: {
        wood: 0,
        clay: 2,
        reed: 0,
        stone: 0,
        food: 1,
        grain: 1,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
    })
    state.players = [player]

    const result = playOccupation(player, FLOW_CARD_ID, { food: 1 }, state, 'lessons')

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(player.occupationPlayed).toContain(FLOW_CARD_ID)
  })

  it('dispatches the just-played occupation after listener through play-occupation', () => {
    const previousRegistry = getActiveCardRegistry()
    const registry = new CardRegistry()
    registry.loadImpl(SELF_AFTER_CARD_ID, B155_ArtTeacher_impl)
    setActiveCardRegistry(registry)
    try {
      const state = createState()
      const player = createPlayer({
        occupationHand: [SELF_AFTER_CARD_ID],
        resources: {
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
        },
      })
      state.players = [player]
      const actions = internalActionDefinitions.filter((action) =>
        ['play-occupation', 'pay', 'gain', 'activate-card-effect'].includes(action.id),
      )
      const engine = buildEngine(actions, 'play-occupation')
      const space = createSpace()

      const choiceStep = engine.proceed({ state, player, space })
      expect(choiceStep.type).toBe('choice')
      const resolved = engine.resolveChoice(SELF_AFTER_CARD_ID, { state, player, space })
      expect(resolved.type).toBe('ok')
      const finalStep = proceedUntilDone(engine, { state, player, space })

      expect(finalStep.type).toBe('done')
      expect(player.occupationPlayed).toContain(SELF_AFTER_CARD_ID)
      expect(player.resources.wood).toBe(1)
      expect(player.resources.reed).toBe(1)
    } finally {
      setActiveCardRegistry(previousRegistry)
    }
  })
})
