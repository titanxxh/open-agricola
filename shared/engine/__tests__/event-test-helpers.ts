import type { ActionDefinition, ActionSpace, GameState, PlayerState } from '../../contract/types'
import { HookDispatcher } from '../dispatcher'
import { Engine } from '../engine'
import { LogStore } from '../log-store'
import { ActionNode } from '../nodes'
import { ActionRegistry } from '../registry'
import { EngineTree } from '../tree'

export const makeEventTestPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'Alice',
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
  workers: [{ id: 'w1', isActive: true, isNewborn: false }],
  rooms: 2,
  houseType: 'wood',
  fields: [],
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
  stats: {
    placedFarmers: 0,
    firstPlayerCount: 0,
    totalRoomsBuilt: 0,
    totalMajorBuilt: 0,
    totalMinorBuilt: 0,
    totalOccupationBuilt: 0,
  },
})

export const makeEventTestState = (): GameState => {
  const player = makeEventTestPlayer()
  return {
    round: 1,
    phase: 'playing',
    roundPhase: 'work',
    draft: null,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    events: [],
    nextEventSeq: 1,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    enableCommunityDeck: false,
    workPhaseObtainedResources: {},
    completedFeedingPhases: 0,
  }
}

export const asActionSpace = (action: ActionDefinition): ActionSpace => ({
  ...action,
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
  takenBy: [],
})

export const makeEventTestEngine = (
  actions: ActionDefinition[],
  root = new ActionNode(`action-${actions[0]!.id}`, actions[0]!.id),
) => {
  const registry = new ActionRegistry()
  actions.forEach((action) => registry.register(action))
  const log = new LogStore()
  const engine = new Engine({
    tree: new EngineTree(root),
    registry,
    hooks: new HookDispatcher(),
    log,
  })
  return { engine, log, registry }
}
