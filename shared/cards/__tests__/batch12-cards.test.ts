import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace, ActionFlow } from '../../game/types'
import { recordActionSnapshot } from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData, isCardFlagged, setCardFlag } from '../helpers/card-state'
import { recordRoundPlacement, resetRoundPlacements } from '../helpers/round-placement'

// Import card registrations
import '../A/A22_Telegram'
import '../A/A40_PottersYard'
import '../A/A54_Credit'
import '../A/A82_WorkCertificate'
import '../A/A92_AdoptiveParents'
import '../A/A96_TaskArtisan'
import '../A/A129_Swagman'
import '../A/A130_MummysBoy'
import '../A/A167_BreederBuyer'
import '../B/B16_MiningHammer'
import '../B/B23_FinalScenario'
import '../B/B29_CookeryLesson'
import '../B/B124_Trimmer'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
    ...overrides,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

// ===== A54 Credit =====
describe('A54_Credit', () => {
  it('onBuy returns gain 5 food flow', () => {
    const effect = getCardEffect('A54_Credit')
    expect(effect).toBeDefined()
    const player = createPlayer()
    const state = createState(player)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any)?.actionId).toBe('gain')
    expect((flow as any)?.params?.food).toBe(5)
  })

  it('onAfterRoundEnd returns xor (pay food or begging) on non-harvest round', () => {
    const effect = getCardEffect('A54_Credit')
    const player = createPlayer()
    player.minorPlayed = ['A54_Credit']
    const state = createState(player)
    state.round = 2 // non-harvest round
    // onRoundEnd sets up the debt
    effect!.onRoundEnd!(state, player)
    const flow = effect!.onAfterRoundEnd!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any)?.type).toBe('xor')
    expect((flow as any)?.children).toHaveLength(2)
  })

  it('onAfterRoundEnd returns nothing on harvest round', () => {
    const effect = getCardEffect('A54_Credit')
    const player = createPlayer()
    player.minorPlayed = ['A54_Credit']
    const state = createState(player)
    state.round = 4 // harvest round
    const flow = effect!.onAfterRoundEnd!(state, player)
    expect(flow).toBeUndefined()
  })
})

// ===== A96 Task Artisan =====
describe('A96_TaskArtisan', () => {
  it('registers onBuy listener for play-occupation', () => {
    const listener = findListener('A96-task-artisan-onbuy')
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('play-occupation')
  })

  it('onBuy gives wood + minor improvement when card is played', () => {
    const listener = findListener('A96-task-artisan-onbuy')
    const player = createPlayer()
    player.occupationPlayed = ['A96_TaskArtisan']
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state, player, space: createSpace('play-occupation'),
      actionId: 'play-occupation', phase: 'after',
      choice: 'A96_TaskArtisan',
    } as any)
    expect(result?.flow?.type).toBe('parallel')
    const children = (result?.flow as any)?.children
    expect(children).toHaveLength(2)
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params?.wood).toBe(1)
    expect(children[1].actionId).toBe('minor-improvement')
  })

  it('onRoundStart gives wood + improvement when quarry revealed', () => {
    const effect = getCardEffect('A96_TaskArtisan')
    const player = createPlayer()
    player.occupationPlayed = ['A96_TaskArtisan']
    const state = createState(player)
    state.round = 5
    state.roundActionOrder[4] = 'western-quarry'
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any)?.type).toBe('parallel')
  })

  it('onRoundStart does nothing when non-quarry revealed', () => {
    const effect = getCardEffect('A96_TaskArtisan')
    const player = createPlayer()
    player.occupationPlayed = ['A96_TaskArtisan']
    const state = createState(player)
    state.round = 5
    state.roundActionOrder[4] = 'sheep-market'
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })
})

// ===== A22 Telegram =====
describe('A22_Telegram', () => {
  it('onBuy stores trigger round based on fences + current round', () => {
    const effect = getCardEffect('A22_Telegram')
    const player = createPlayer()
    player.fences = 3
    const state = createState(player)
    state.round = 5
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'A22_Telegram', 'triggerRound')).toBe(8)
  })

  it('onBuy does not store if target round exceeds 14', () => {
    const effect = getCardEffect('A22_Telegram')
    const player = createPlayer()
    player.fences = 12
    const state = createState(player)
    state.round = 5
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'A22_Telegram', 'triggerRound')).toBeUndefined()
  })

  it('onBeforeStartOfTurn offers place-farmer at trigger round', () => {
    const effect = getCardEffect('A22_Telegram')
    const player = createPlayer()
    player.minorPlayed = ['A22_Telegram']
    player.fences = 2
    const state = createState(player)
    state.round = 5
    // First buy the card
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'A22_Telegram', 'triggerRound')).toBe(7)
    // Now at round 7, trigger
    state.round = 7
    const flow = effect!.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any)?.type).toBe('seq')
    expect((flow as any)?.optional).toBe(true)
    const children = (flow as any)?.children
    expect(children[0].actionId).toBe('place-farmer')
  })
})

// ===== A82 Work Certificate =====
describe('A82_WorkCertificate', () => {
  it('registers after place-farmer listener', () => {
    const listener = findListener('A82-work-certificate-after-place-farmer')
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('place-farmer')
    expect(listener!.phases).toContain('after')
  })

  it('returns xor with options when accumulation space has 4+ building resources', () => {
    const listener = findListener('A82-work-certificate-after-place-farmer')!
    const player = createPlayer()
    player.minorPlayed = ['A82_WorkCertificate']
    const state = createState(player)
    const woodSpace = createSpace('forest', {
      gainPerRound: { wood: 3 },
      resources: { wood: 5, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    } as any)
    state.actionSpaces = [woodSpace]
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('xor')
    const children = (result?.flow as any)?.children
    expect(children.length).toBeGreaterThan(0)
    // Should offer wood from forest
    const woodOption = children.find((c: any) =>
      c.type === 'leaf' ? c.params?.wood === 1 : c.children?.[0]?.params?.wood === 1
    )
    expect(woodOption).toBeDefined()
  })

  it('returns nothing when no spaces have 4+ building resources', () => {
    const listener = findListener('A82-work-certificate-after-place-farmer')!
    const player = createPlayer()
    player.minorPlayed = ['A82_WorkCertificate']
    const state = createState(player)
    const woodSpace = createSpace('copse', {
      gainPerRound: { wood: 1 },
      resources: { wood: 2, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    } as any)
    state.actionSpaces = [woodSpace]
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== A40 Potter's Yard =====
describe('A40_PottersYard', () => {
  it('onBuy sets clay remaining based on free tiles', () => {
    const effect = getCardEffect('A40_PottersYard')
    const player = createPlayer()
    // 2 rooms at (0,0) and (1,0), so 15 - 2 = 13 free tiles
    const state = createState(player)
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'A40_PottersYard', 'clayRemaining')).toBe(13)
  })

  it('after plow collects clay and offers exchange', () => {
    const effect = getCardEffect('A40_PottersYard')
    const player = createPlayer()
    player.minorPlayed = ['A40_PottersYard']
    const state = createState(player)
    effect!.onBuy!(state, player)
    // Simulate: before plow, record used count
    const beforeListener = findListener('A40-potters-yard-before-plow')!
    executeCardListener(beforeListener, {
      state, player, space: createSpace('farmland'),
      actionId: 'plow', phase: 'before',
    } as any)
    // Simulate plowing: add a field at (0,1)
    player.fields.push({ row: 0, col: 1, crop: null, remaining: 0 })
    // After plow: should collect 1 clay
    const afterListener = findListener('A40-potters-yard-after-plow')!
    const result = executeCardListener(afterListener, {
      state, player, space: createSpace('farmland'),
      actionId: 'plow', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.type).toBe('seq')
    // First child should be gain clay
    const gainChild = (result?.flow as any)?.children?.[0]
    expect(gainChild?.actionId).toBe('gain')
    expect(gainChild?.params?.clay).toBe(1)
    // Clay remaining should decrease
    expect(readCardExtraData(player, 'A40_PottersYard', 'clayRemaining')).toBe(12)
  })

  it('does not trigger when no clay remaining', () => {
    const player = createPlayer()
    player.minorPlayed = ['A40_PottersYard']
    // Set clay remaining to 0
    writeCardExtraData(player, 'A40_PottersYard', 'clayRemaining', 0)
    const state = createState(player)
    const afterListener = findListener('A40-potters-yard-after-plow')!
    const result = executeCardListener(afterListener, {
      state, player, space: createSpace('farmland'),
      actionId: 'plow', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== A130 Mummy's Boy =====
describe('A130_MummysBoy', () => {
  it('computeArgs adds 2nd farmer space when 2+ farmers placed', () => {
    const listener = findListener('A130-mummys-boy-compute-args-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A130_MummysBoy']
    player.familySize = 4
    player.workersAvailable = 2 // 2 placed
    resetRoundPlacements(player)
    recordRoundPlacement(player, 'farmland')
    recordRoundPlacement(player, 'forest')
    const state = createState(player)
    const forestSpace = createSpace('forest', { takenBy: 'p2' } as any)
    state.actionSpaces = [forestSpace]
    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'computeArgs',
    } as any)
    expect(result?.extraOptions).toBeDefined()
    expect(result!.extraOptions!.length).toBe(1)
    expect(result!.extraOptions![0].value).toContain('forest')
  })

  it('does not add options when less than 2 farmers placed', () => {
    const listener = findListener('A130-mummys-boy-compute-args-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A130_MummysBoy']
    player.familySize = 3
    player.workersAvailable = 2 // only 1 placed
    resetRoundPlacements(player)
    recordRoundPlacement(player, 'farmland')
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'computeArgs',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not add Meeting Place as option', () => {
    const listener = findListener('A130-mummys-boy-compute-args-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A130_MummysBoy']
    player.familySize = 4
    player.workersAvailable = 2
    resetRoundPlacements(player)
    recordRoundPlacement(player, 'farmland')
    recordRoundPlacement(player, 'meeting-place')
    const state = createState(player)
    state.actionSpaces = [createSpace('meeting-place', { takenBy: 'p1' } as any)]
    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'computeArgs',
    } as any)
    expect(result).toBeUndefined()
  })

  it('flags card when 3rd farmer placed on 2nd farmer space', () => {
    const listener = findListener('A130-mummys-boy-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A130_MummysBoy']
    player.familySize = 4
    player.workersAvailable = 1 // 3 placed
    resetRoundPlacements(player)
    recordRoundPlacement(player, 'farmland')
    recordRoundPlacement(player, 'forest')
    recordRoundPlacement(player, 'forest') // placed on 2nd farmer's space
    const state = createState(player)
    executeCardListener(listener, {
      state, player, space: createSpace('forest'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(isCardFlagged(player, 'A130_MummysBoy')).toBe(true)
  })

  it('unflag on beforeStartOfTurn', () => {
    const effect = getCardEffect('A130_MummysBoy')
    const player = createPlayer()
    player.occupationPlayed = ['A130_MummysBoy']
    setCardFlag(player, 'A130_MummysBoy', true)
    const state = createState(player)
    effect!.onBeforeStartOfTurn!(state, player)
    expect(isCardFlagged(player, 'A130_MummysBoy')).toBe(false)
  })
})

// ===== A167 Breeder Buyer =====
describe('A167_BreederBuyer', () => {
  it('after construct with stables built gives livestock', () => {
    const listener = findListener('A167-breeder-buyer-after-construct')!
    const player = createPlayer()
    player.occupationPlayed = ['A167_BreederBuyer']
    player.houseType = 'wood'
    // Simulate: snapshot shows 0 stables before, player has 1 stable now
    recordActionSnapshot(player, 42)
    player.stableTiles = [{ row: 2, col: 2 }]
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farm-expansion'),
      actionId: 'construct', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.params?.sheep).toBe(1) // wood house → sheep
  })

  it('after stables with rooms built gives livestock (clay)', () => {
    const listener = findListener('A167-breeder-buyer-after-stables')!
    const player = createPlayer()
    player.occupationPlayed = ['A167_BreederBuyer']
    player.houseType = 'clay'
    // Simulate: snapshot shows 2 rooms before, player has 3 rooms now
    recordActionSnapshot(player, 43)
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farm-expansion'),
      actionId: 'stables', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.params?.boar).toBe(1) // clay house → boar
  })

  it('no livestock if only stables without rooms', () => {
    const listener = findListener('A167-breeder-buyer-after-stables')!
    const player = createPlayer()
    player.occupationPlayed = ['A167_BreederBuyer']
    player.houseType = 'wood'
    recordActionSnapshot(player, 44)
    // No new rooms since snapshot (roomTiles same as snapshot)
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('fencing'),
      actionId: 'stables', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== B16 Mining Hammer =====
describe('B16_MiningHammer', () => {
  it('onBuy gives 1 food', () => {
    const listener = findListener('B16-mining-hammer-onbuy')!
    const player = createPlayer()
    player.minorPlayed = ['B16_MiningHammer']
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('play-improvement'),
      actionId: 'play-improvement', phase: 'after',
      choice: 'minor:B16_MiningHammer',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.params?.food).toBe(1)
  })

  it('after renovate offers free stable', () => {
    const listener = findListener('B16-mining-hammer-after-renovate')!
    const player = createPlayer()
    player.minorPlayed = ['B16_MiningHammer']
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.actionId).toBe('stables')
    expect((result?.flow as any)?.optional).toBe(true)
    expect((result?.flow as any)?.actionContext?.costOverride).toEqual({})
    expect((result?.flow as any)?.actionContext?.max).toBe(1)
  })
})

// ===== B23 Final Scenario =====
describe('B23_FinalScenario', () => {
  it('onBuy stores round 14 space info', () => {
    const effect = getCardEffect('B23_FinalScenario')
    const player = createPlayer()
    const state = createState(player)
    state.round = 10
    state.roundActionOrder[13] = 'fencing'
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'B23_FinalScenario', 'round14Space')).toBe('fencing')
    expect(readCardExtraData(player, 'B23_FinalScenario', 'exclusiveOwnerId')).toBe('p1')
  })

  it('onRoundStart at round 14 clears exclusive use', () => {
    const effect = getCardEffect('B23_FinalScenario')
    const player = createPlayer()
    player.minorPlayed = ['B23_FinalScenario']
    const state = createState(player)
    state.round = 10
    state.roundActionOrder[13] = 'fencing'
    effect!.onBuy!(state, player)
    state.round = 14
    effect!.onRoundStart!(state, player)
    expect(readCardExtraData(player, 'B23_FinalScenario', 'exclusiveOwnerId')).toBeNull()
  })

  it('onBuy does nothing at round 14', () => {
    const effect = getCardEffect('B23_FinalScenario')
    const player = createPlayer()
    const state = createState(player)
    state.round = 14
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })
})

// ===== B124 Trimmer =====
describe('B124_Trimmer', () => {
  it('onBuy stores current pasture area', () => {
    const effect = getCardEffect('B124_Trimmer')
    const player = createPlayer()
    player.pastures = [
      { id: 'p1', size: 2, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
    ]
    const state = createState(player)
    effect!.onBuy!(state, player)
    expect(readCardExtraData(player, 'B124_Trimmer', 'pastureArea')).toBe(2)
    expect(isCardFlagged(player, 'B124_Trimmer')).toBe(false)
  })

  it('after fencing gives 2 stone when pasture area increases', () => {
    const listener = findListener('B124-trimmer-after-fencing')!
    const player = createPlayer()
    player.occupationPlayed = ['B124_Trimmer']
    // Store previous area = 0
    writeCardExtraData(player, 'B124_Trimmer', 'pastureArea', 0)
    // Now player has a new pasture
    player.pastures = [
      { id: 'p1', size: 2, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
    ]
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('fencing'),
      actionId: 'fencing', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.params?.stone).toBe(2)
  })

  it('after fencing no stone when pasture area does not increase', () => {
    const listener = findListener('B124-trimmer-after-fencing')!
    const player = createPlayer()
    player.occupationPlayed = ['B124_Trimmer']
    player.pastures = [
      { id: 'p1', size: 2, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
    ]
    writeCardExtraData(player, 'B124_Trimmer', 'pastureArea', 2) // Same as current
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('fencing'),
      actionId: 'fencing', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('flags card after fencing to prevent double trigger', () => {
    const listener = findListener('B124-trimmer-after-fencing')!
    const player = createPlayer()
    player.occupationPlayed = ['B124_Trimmer']
    writeCardExtraData(player, 'B124_Trimmer', 'pastureArea', 0)
    player.pastures = [
      { id: 'p1', size: 1, tiles: [{ row: 1, col: 1 }], stables: 0, animalType: null, animalCount: 0 },
    ]
    const state = createState(player)
    executeCardListener(listener, {
      state, player, space: createSpace('fencing'),
      actionId: 'fencing', phase: 'after',
    } as any)
    expect(isCardFlagged(player, 'B124_Trimmer')).toBe(true)
  })
})

// ===== A129 Swagman =====
describe('A129_Swagman', () => {
  it('after farm-expansion offers grain-seeds flow', () => {
    const listener = findListener('A129-swagman-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A129_Swagman']
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farm-expansion'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.optional).toBe(true)
    const children = (result?.flow as any)?.children
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params?.grain).toBe(1)
  })

  it('after grain-seeds offers farm-expansion flow', () => {
    const listener = findListener('A129-swagman-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A129_Swagman']
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('grain-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    const children = (result?.flow as any)?.children
    expect(children[0].type).toBe('or')
    expect(children[0].children[0].actionId).toBe('construct')
    expect(children[0].children[1].actionId).toBe('stables')
  })

  it('does not trigger on non-matching spaces', () => {
    const listener = findListener('A129-swagman-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A129_Swagman']
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('day-laborer'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when flagged', () => {
    const listener = findListener('A129-swagman-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A129_Swagman']
    setCardFlag(player, 'A129_Swagman', true)
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farm-expansion'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== A92 Adoptive Parents =====
describe('A92_AdoptiveParents', () => {
  it('after place-farmer offers pay 1 food + place-farmer when newborn exists', () => {
    const listener = findListener('A92-adoptive-parents-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A92_AdoptiveParents']
    player.newbornCount = 1
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.optional).toBe(true)
    const children = (result?.flow as any)?.children
    expect(children).toHaveLength(3)
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params?.food).toBe(1)
    expect(children[2].actionId).toBe('place-farmer')
  })

  it('does not trigger when no newborns', () => {
    const listener = findListener('A92-adoptive-parents-after-place-farmer')!
    const player = createPlayer()
    player.occupationPlayed = ['A92_AdoptiveParents']
    player.newbornCount = 0
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})

// ===== B29 Cookery Lesson =====
describe('B29_CookeryLesson', () => {
  it('after exchange gives VP when lessons already used', () => {
    const listener = findListener('B29-cookery-lesson-after-exchange')!
    const player = createPlayer()
    player.minorPlayed = ['B29_CookeryLesson']
    // Simulate lessons used
    resetRoundPlacements(player)
    recordRoundPlacement(player, 'lessons')
    recordActionSnapshot(player, 100)
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('anytime-exchange'),
      actionId: 'anytime-exchange', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.actionId).toBe('bonus-vp')
  })

  it('after exchange does not give VP when lessons not used', () => {
    const listener = findListener('B29-cookery-lesson-after-exchange')!
    const player = createPlayer()
    player.minorPlayed = ['B29_CookeryLesson']
    resetRoundPlacements(player) // no lessons
    recordActionSnapshot(player, 101)
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('anytime-exchange'),
      actionId: 'anytime-exchange', phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('after place-farmer on lessons gives VP when cooked', () => {
    const listener = findListener('B29-cookery-lesson-after-place-farmer')!
    const player = createPlayer()
    player.minorPlayed = ['B29_CookeryLesson']
    recordActionSnapshot(player, 102)
    // Mark cooked
    writeCardExtraData(player, 'B29_CookeryLesson', 'cookedThisRound', true)
    const state = createState(player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('lessons'),
      actionId: 'place-farmer', phase: 'after',
    } as any)
    expect(result?.flow).toBeDefined()
    expect((result?.flow as any)?.actionId).toBe('bonus-vp')
  })
})
