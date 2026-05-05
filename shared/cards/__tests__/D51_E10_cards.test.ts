import { describe, expect, it, vi } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import {
  getPlayerActionSpaceConfig,
  createPlayerActionSpaces,
} from '../player-action-space'
import { moveFarmerToSpaceAction } from '../../actions/effects/internal/move-farmer-to-space'

// Import cards to register effects
import '../A/A28_ForestSchool'
import '../D/D51_Archway'
import '../E/E10_StrawHat'
import type { ActionFlow } from '../../game/types'
import type { ActionExecutionContext } from '../../game/types'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
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
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const createState = (players: PlayerState[], spaces: ActionSpace[] = []): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: spaces, log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
    roundPhase: 'work',
  }) as GameState

describe('PlayerActionSpace infrastructure', () => {
  it('D51 is registered with access=all', () => {
    const config = getPlayerActionSpaceConfig('D51_Archway')
    expect(config).toBeDefined()
    expect(config!.access).toBe('all')
  })

  it('createPlayerActionSpaces creates space when card is in minorPlayed', () => {
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const state = createState([player])
    const spaces = createPlayerActionSpaces(state)
    expect(spaces.length).toBe(1)
    expect(spaces[0].id).toBe('D51_Archway')
  })

  it('createPlayerActionSpaces does not duplicate', () => {
    const p1 = createPlayer('p1')
    p1.minorPlayed = ['D51_Archway']
    const p2 = createPlayer('p2')
    p2.minorPlayed = ['D51_Archway']
    const spaces = createPlayerActionSpaces(createState([p1, p2]))
    expect(spaces.filter((s) => s.id === 'D51_Archway').length).toBe(1)
  })

  it('createPlayerActionSpaces ignores non-registered cards', () => {
    const player = createPlayer()
    player.minorPlayed = ['A55_JunkRoom']
    const spaces = createPlayerActionSpaces(createState([player]))
    expect(spaces.length).toBe(0)
  })
})

describe('D51_Archway', () => {
  it('action space execute gives 1 food', () => {
    const config = getPlayerActionSpaceConfig('D51_Archway')!
    const def = config.createDefinition('p1')
    const player = createPlayer()
    const result = def.execute!({
      state: createState([player]),
      player,
      space: createSpace('D51_Archway'),
    } as unknown as ActionExecutionContext)
    expect(result.type).toBe('ok')
    expect(player.resources.food).toBe(1)
  })

  it('onBuy adds D51 action space to state', () => {
    const effect = getCardEffect('D51_Archway')!
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const state = createState([player])
    expect(state.actionSpaces.length).toBe(0)
    effect.onBuy!(state, player)
    expect(state.actionSpaces.some((s) => s.id === 'D51_Archway')).toBe(true)
  })

  it('onBuy does not duplicate action space', () => {
    const effect = getCardEffect('D51_Archway')!
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const state = createState([player])
    effect.onBuy!(state, player)
    effect.onBuy!(state, player)
    expect(state.actionSpaces.filter((s) => s.id === 'D51_Archway').length).toBe(1)
  })

  it('onBeforeReturnHome triggers when player worker is on D51', () => {
    const effect = getCardEffect('D51_Archway')!
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const d51Space = createSpace('D51_Archway', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const targetSpace = createSpace('day-laborer')
    const state = createState([player], [d51Space, targetSpace])
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('move-farmer-to-space')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params.excludeSpaceId).toBe('D51_Archway')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
  })

  it('onBeforeReturnHome does not trigger when different player on D51', () => {
    const effect = getCardEffect('D51_Archway')!
    const p1 = createPlayer('p1')
    p1.minorPlayed = ['D51_Archway']
    const d51Space = createSpace('D51_Archway', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const targetSpace = createSpace('day-laborer')
    const state = createState([p1], [d51Space, targetSpace])
    const flow = effect.onBeforeReturnHome!(state, p1)
    expect(flow).toBeUndefined()
  })

  it('onBeforeReturnHome does not trigger when no one on D51', () => {
    const effect = getCardEffect('D51_Archway')!
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const d51Space = createSpace('D51_Archway')
    const targetSpace = createSpace('day-laborer')
    const state = createState([player], [d51Space, targetSpace])
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBeforeReturnHome does not trigger when no available spaces', () => {
    const effect = getCardEffect('D51_Archway')!
    const player = createPlayer()
    player.minorPlayed = ['D51_Archway']
    const d51Space = createSpace('D51_Archway', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const occupiedSpace = createSpace('day-laborer', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const state = createState([player], [d51Space, occupiedSpace])
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })
})

describe('E10_StrawHat', () => {
  it('triggers on round 3 with worker on farmland', () => {
    const effect = getCardEffect('E10_StrawHat')!
    const player = createPlayer()
    player.minorPlayed = ['E10_StrawHat']
    const farmland = createSpace('farmland', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const target = createSpace('day-laborer')
    const state = createState([player], [farmland, target])
    state.round = 3
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    if (flow!.type === 'xor') {
      expect(flow!.children.length).toBe(2)
      expect((flow!.children[0] as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('move-farmer-to-space')
      expect((flow!.children[0] as Extract<ActionFlow, { type: 'leaf' }>).params.excludeSpaceId).toBe('farmland')
      expect((flow!.children[1] as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    }
  })

  it('triggers on round 6', () => {
    const effect = getCardEffect('E10_StrawHat')!
    const player = createPlayer()
    player.minorPlayed = ['E10_StrawHat']
    const farmland = createSpace('farmland', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const target = createSpace('day-laborer')
    const state = createState([player], [farmland, target])
    state.round = 6
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
  })

  it('does not trigger on round 4', () => {
    const effect = getCardEffect('E10_StrawHat')!
    const player = createPlayer()
    player.minorPlayed = ['E10_StrawHat']
    const farmland = createSpace('farmland', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const state = createState([player], [farmland])
    state.round = 4
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does not trigger when worker not on farmland', () => {
    const effect = getCardEffect('E10_StrawHat')!
    const player = createPlayer()
    player.minorPlayed = ['E10_StrawHat']
    const farmland = createSpace('farmland', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const state = createState([player], [farmland])
    state.round = 3
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does not trigger when farmland has no worker', () => {
    const effect = getCardEffect('E10_StrawHat')!
    const player = createPlayer()
    player.minorPlayed = ['E10_StrawHat']
    const farmland = createSpace('farmland')
    const state = createState([player], [farmland])
    state.round = 3
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('only offers food when no available spaces', () => {
    const effect = getCardEffect('E10_StrawHat')!
    const player = createPlayer()
    player.minorPlayed = ['E10_StrawHat']
    const farmland = createSpace('farmland', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const occupied = createSpace('day-laborer', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const state = createState([player], [farmland, occupied])
    state.round = 3
    const flow = effect.onBeforeReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    if (flow!.type === 'xor') {
      expect(flow!.children.length).toBe(1)
      expect((flow!.children[0] as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    }
  })

})

describe('move-farmer-to-space action', () => {
  // SKIP[S1]: 'choice'→'request' codemod pending, see docs/skip-tracker.md
  it.skip('execute lists unoccupied spaces excluding source', () => {
    const player = createPlayer()
    const source = createSpace('D51_Archway', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const available = createSpace('day-laborer')
    const occupied = createSpace('plow', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const state = createState([player], [source, available, occupied])
    const result = moveFarmerToSpaceAction.execute({
      state, player, space: source,
      params: { excludeSpaceId: 'D51_Archway' },
    } as unknown as ActionExecutionContext)
    expect(result.type).toBe('choice')
    if (result.type === 'choice') {
      expect(result.options!.length).toBe(1)
      expect(result.options![0].value).toBe('day-laborer')
    }
  })

  it('execute returns fail when no spaces available', () => {
    const player = createPlayer()
    const source = createSpace('D51_Archway', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const occupied = createSpace('plow', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const state = createState([player], [source, occupied])
    const result = moveFarmerToSpaceAction.execute({
      state, player, space: source,
      params: { excludeSpaceId: 'D51_Archway' },
    } as unknown as ActionExecutionContext)
    expect(result.type).toBe('fail')
  })

  // SKIP[S1]: 'choice'→'request' codemod pending, see docs/skip-tracker.md
  it.skip('execute includes occupied Lessons with A28_ForestSchool', () => {
    const player = createPlayer()
    player.minorPlayed = ['A28_ForestSchool']
    const source = createSpace('D51_Archway', { takenBy: [{ playerId: 'p1', workerId: '1' }] })
    const lessons = createSpace('lessons', { takenBy: [{ playerId: 'p2', workerId: '1' }] })
    const state = createState([player], [source, lessons])
    const result = moveFarmerToSpaceAction.execute({
      state, player, space: source,
      params: { excludeSpaceId: 'D51_Archway' },
    } as unknown as ActionExecutionContext)
    expect(result.type).toBe('choice')
    if (result.type === 'choice') {
      expect(result.options!.some((o) => o.value === 'lessons')).toBe(true)
    }
  })

  it('resolveChoice executes target space and marks takenBy', () => {
    const executeSpy = vi.fn(() => ({ type: 'ok' as const }))
    const player = createPlayer()
    const target = createSpace('day-laborer', { execute: executeSpy } as any)
    const state = createState([player], [target])
    const result = moveFarmerToSpaceAction.resolveChoice!(
      { state, player, space: createSpace('source') } as unknown as ActionExecutionContext,
      'day-laborer',
    )
    expect(result.type).toBe('ok')
    expect(target.takenBy[0]?.playerId).toBe('p1')
    expect(executeSpy).toHaveBeenCalled()
  })

  it('resolveChoice returns fail for invalid choice', () => {
    const player = createPlayer()
    const state = createState([player], [])
    const result = moveFarmerToSpaceAction.resolveChoice!(
      { state, player, space: createSpace('source') } as unknown as ActionExecutionContext,
      'nonexistent',
    )
    expect(result.type).toBe('fail')
  })
})
