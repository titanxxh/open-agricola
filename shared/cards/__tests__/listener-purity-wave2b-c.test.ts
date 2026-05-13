import { describe, expect, it } from 'vitest'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { recordActionSnapshot } from '../helpers/action-snapshot'
import { storePendingFenceBonus } from '../helpers/pending-fence-bonus'
import { A68_AsparagusGift_impl } from '../A/A68_AsparagusGift'
import { A73_AgriculturalFertilizers_impl } from '../A/A73_AgriculturalFertilizers'
import { A92_AdoptiveParents_impl } from '../A/A92_AdoptiveParents'
import { B18_GrasslandHarrow_impl } from '../B/B18_GrasslandHarrow'
import { B34_SpecialFood_impl } from '../B/B34_SpecialFood'
import { B76_Ceilings_impl } from '../B/B76_Ceilings'
import { C48_Farmstead_impl } from '../C/C48_Farmstead'
import { C53_GypsysCrock_impl } from '../C/C53_GypsysCrock'
import { C88_CarpentersApprentice_impl } from '../C/C88_CarpentersApprentice'
import { C93_InnerDistrictsDirector_impl } from '../C/C93_InnerDistrictsDirector'
import { C130_OutskirtsDirector_impl } from '../C/C130_OutskirtsDirector'
import { C150_ParrotBreeder_impl } from '../C/C150_ParrotBreeder'
import { D36_BreedRegistry_impl } from '../D/D36_BreedRegistry'
import { D56_FatstockStretcher_impl } from '../D/D56_FatstockStretcher'
import { D74_RoyalWood_impl } from '../D/D74_RoyalWood'
import { D158_BeanCounter_impl } from '../D/D158_BeanCounter'
import { E53_BoarSpear_impl } from '../E/E53_BoarSpear'
import { E74_AshTrees_impl } from '../E/E74_AshTrees'
import { E85_MasterTanner_impl } from '../E/E85_MasterTanner'
import { E148_Lazybones_impl } from '../E/E148_Lazybones'

const TARGETS = [
  'A68_AsparagusGift',
  'A73_AgriculturalFertilizers',
  'A92_AdoptiveParents',
  'B18_GrasslandHarrow',
  'B34_SpecialFood',
  'B76_Ceilings',
  'C48_Farmstead',
  'C53_GypsysCrock',
  'C88_CarpentersApprentice',
  'C93_InnerDistrictsDirector',
  'C130_OutskirtsDirector',
  'C150_ParrotBreeder',
  'D36_BreedRegistry',
  'D56_FatstockStretcher',
  'D74_RoyalWood',
  'D158_BeanCounter',
  'E53_BoarSpear',
  'E74_AshTrees',
  'E85_MasterTanner',
  'E148_Lazybones',
] as const

type LeafFlow = Extract<ActionFlow, { type: 'leaf' }>

const resource = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

const player = (
  cardId: string,
  overrides: Partial<PlayerState> = {},
): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resource(),
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
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [cardId],
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
  cardStates: { [cardId]: {} },
  stats: {
    placedFarmers: 0,
    firstPlayerCount: 0,
    totalRoomsBuilt: 0,
    totalMajorBuilt: 0,
    totalMinorBuilt: 0,
    totalOccupationBuilt: 0,
    harvestedGrain: 0,
    harvestedVegetable: 0,
    resourcesFromBoard: {},
    resourcesFromCards: {},
    resourcesConverted: {},
    foodFromConversion: {},
    draftHistory: [],
    draftDiscarded: [],
  },
  ...overrides,
})

const space = (
  id: string,
  overrides: Partial<ActionSpace> = {},
): ActionSpace => ({
  id,
  nameKey: `test.${id}.name`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  resources: resource(),
  takenBy: [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  ...overrides,
} as ActionSpace)

const state = (
  players: PlayerState[],
  overrides: Partial<GameState> = {},
): GameState => {
  const base: GameState = {
    round: 3,
    phase: 'playing',
    roundPhase: 'work',
    draft: null,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }, () => null),
    gameSeed: 1,
    rngTick: 0,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    enableCommunityDeck: false,
    workPhaseObtainedResources: {},
    harvestReapSummary: {},
    harvestBreedSummary: {},
  }
  return { ...base, ...overrides }
}

const context = (
  owner: PlayerState,
  overrides: Partial<CardListenerContext> = {},
): CardListenerContext => ({
  state: state([owner]),
  player: owner,
  triggerPlayer: owner,
  ownerPlayer: owner,
  effectPlayer: owner,
  space: space('test-space'),
  actionId: 'place-farmer',
  phase: 'after',
  result: { type: 'ok' },
  ...overrides,
})

const stateSnapshot = (gameState: GameState) => JSON.stringify({
  ...gameState,
  actionSpaces: gameState.actionSpaces.map((actionSpace) =>
    Object.fromEntries(
      Object.entries(actionSpace).filter(([, value]) => typeof value !== 'function'),
    ),
  ),
})

const expectUnchanged = (before: string, after: GameState) => {
  expect(stateSnapshot(after)).toBe(before)
}

const listenerById = (
  listeners: readonly CardListenerRegistration[] | undefined,
  id: string,
): CardListenerRegistration => {
  const listener = listeners?.find((entry) => entry.id === id)
  expect(listener, `listener ${id}`).toBeDefined()
  return listener!
}

const firstLeaf = (flow: ActionFlow | undefined): LeafFlow | undefined => {
  if (!flow) return undefined
  if (flow.type === 'leaf') return flow
  if ('children' in flow) return flow.children.find((child): child is LeafFlow => child.type === 'leaf')
  return undefined
}

describe('listener purity wave 2b/c', () => {
  it('covers every remaining Wave2b/c target named in the plan', () => {
    expect(TARGETS).toEqual([
      'A68_AsparagusGift',
      'A73_AgriculturalFertilizers',
      'A92_AdoptiveParents',
      'B18_GrasslandHarrow',
      'B34_SpecialFood',
      'B76_Ceilings',
      'C48_Farmstead',
      'C53_GypsysCrock',
      'C88_CarpentersApprentice',
      'C93_InnerDistrictsDirector',
      'C130_OutskirtsDirector',
      'C150_ParrotBreeder',
      'D36_BreedRegistry',
      'D56_FatstockStretcher',
      'D74_RoyalWood',
      'D158_BeanCounter',
      'E53_BoarSpear',
      'E74_AshTrees',
      'E85_MasterTanner',
      'E148_Lazybones',
    ])
  })

  it('A68 AsparagusGift before-fencing snapshots fence count by flow only', () => {
    const p = player('A68_AsparagusGift', {
      fenceSegments: [{ type: 'fence', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A68_AsparagusGift_impl.listeners, 'A68-asparagus-gift-before-fencing')
      .handler(context(p, { state: game, actionId: 'fence', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A68_AsparagusGift',
      params: { kind: 'set-extra-data', key: 'fencesBefore' },
    })
  })

  it('A73 AgriculturalFertilizers before-action snapshots used spaces by flow only', () => {
    const p = player('A73_AgriculturalFertilizers', {
      roomTiles: [{ row: 0, col: 0 }],
      fields: [{ row: 0, col: 1, stacks: [] }],
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A73_AgriculturalFertilizers_impl.listeners, 'A73-agri-fert-before')
      .handler(context(p, { state: game, actionId: 'construct', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A73_AgriculturalFertilizers',
      params: { kind: 'set-extra-data', key: 'spacesBefore' },
    })
  })

  it('A92 AdoptiveParents promote-newborn activation returns mutation leaves without mutating state', () => {
    const p = player('A92_AdoptiveParents', {
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: true },
      ],
    })
    const harvest = space('family-growth', { takenBy: [{ playerId: p.id, workerId: '2' }] })
    const game = state([p], { actionSpaces: [harvest] })
    const before = stateSnapshot(game)

    const result = listenerById(A92_AdoptiveParents_impl.listeners, 'A92-adoptive-parents-before-gain-activation')
      .handler(context(p, { state: game, actionId: 'gain', phase: 'immediatelyAfter', sourceCard: 'A92_AdoptiveParents' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'A92_AdoptiveParents', params: { kind: 'promote-first-newborn' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'A92_AdoptiveParents', params: { kind: 'set-flag', flag: true } },
      ],
    })
  })

  it('A92 AdoptiveParents does not arm the place-farmer flag without a newborn', () => {
    const p = player('A92_AdoptiveParents')
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A92_AdoptiveParents_impl.listeners, 'A92-adoptive-parents-before-gain-activation')
      .handler(context(p, { state: game, actionId: 'gain', phase: 'immediatelyAfter', sourceCard: 'A92_AdoptiveParents' }))

    expectUnchanged(before, game)
    expect(result).toBeUndefined()
  })

  it('A92 AdoptiveParents before-place-farmer clears flag by flow only', () => {
    const p = player('A92_AdoptiveParents', {
      cardStates: { A92_AdoptiveParents: { flagged: true } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A92_AdoptiveParents_impl.listeners, 'A92-adoptive-parents-before-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A92_AdoptiveParents',
      params: { kind: 'set-flag', flag: false },
    })
  })

  it('B18 GrasslandHarrow queues target round and future meeple lazily', () => {
    const p = player('B18_GrasslandHarrow', {
      resources: resource({ wood: 2, clay: 1 }),
    })
    const game = state([p], { round: 4 })
    const before = stateSnapshot(game)

    const result = listenerById(B18_GrasslandHarrow_impl.listeners, 'B18-grassland-harrow-after-pay')
      .handler(context(p, { state: game, actionId: 'pay', phase: 'after', sourceCard: 'B18_GrasslandHarrow' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'B18_GrasslandHarrow', params: { kind: 'set-extra-data', key: 'targetRound', value: 7 } },
        { type: 'leaf', actionId: 'future-meeples', params: { __futureMeepleRequest: { cardId: 'B18_GrasslandHarrow', playerId: p.id } } },
      ],
    })
  })

  it('B34 SpecialFood before-collect stores animal snapshot by flow only', () => {
    const p = player('B34_SpecialFood', {
      houseAnimalType: 'sheep',
      houseAnimalCount: 1,
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(B34_SpecialFood_impl.listeners, 'B34-special-food-before-collect')
      .handler(context(p, { state: game, actionId: 'collect', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'B34_SpecialFood',
      params: { kind: 'set-extra-data', key: 'animalsBeforeCollecting' },
    })
  })

  it('B76 Ceilings removes future meeples and sets flag by flow only', () => {
    const p = player('B76_Ceilings')
    const game = state([p], {
      futureMeeples: [{ id: 'b76-1', cardId: 'B76_Ceilings', playerId: p.id, round: 4, actionId: 'forest', resources: { wood: 1 } }],
    })
    const before = stateSnapshot(game)

    const result = listenerById(B76_Ceilings_impl.listeners, 'B76-ceilings-after-renovation')
      .handler(context(p, { state: game, actionId: 'renovate-house', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'B76_Ceilings', params: { kind: 'remove-future-meeples' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'B76_Ceilings', params: { kind: 'set-flag', flag: true } },
      ],
    })
  })

  it('C48 Farmstead before-place-farmer snapshots used tiles by flow only', () => {
    const p = player('C48_Farmstead', { roomTiles: [{ row: 0, col: 0 }] })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C48_Farmstead_impl.listeners, 'C48-farmstead-before-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C48_Farmstead',
      params: { kind: 'set-extra-data', key: 'usedTilesBefore' },
    })
  })

  it('C48 Farmstead after-place-farmer clears snapshot through flow before reward', () => {
    const p = player('C48_Farmstead', {
      roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      cardStates: { C48_Farmstead: { extraData: { usedTilesBefore: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C48_Farmstead_impl.listeners, 'C48-farmstead-after-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C48_Farmstead', params: { kind: 'set-extra-data', key: 'usedTilesBefore', value: undefined } },
        { type: 'leaf', actionId: 'gain', sourceCard: 'C48_Farmstead', params: { food: 1 } },
      ],
    })
  })

  it('C53 GypsysCrock trade-applied increments cooked counter by flow only', () => {
    const p = player('C53_GypsysCrock', {
      cardStates: { C53_GypsysCrock: { extraData: { cookedCount: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C53_GypsysCrock_impl.listeners, 'C53-gypsys-crock-trade-applied')
      .handler(context(p, { state: game, actionId: 'trade-applied', phase: 'immediatelyAfter', extraData: { sourceId: 'Major_Fireplace1', times: 2 } }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C53_GypsysCrock',
      params: { kind: 'set-extra-data', key: 'cookedCount', value: 3 },
    })
  })

  it('C53 GypsysCrock after-exchange resets cooked counter by flow before gain', () => {
    const p = player('C53_GypsysCrock', {
      cardStates: { C53_GypsysCrock: { extraData: { cookedCount: 3 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C53_GypsysCrock_impl.listeners, 'C53-gypsys-crock-after-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C53_GypsysCrock', params: { kind: 'set-extra-data', key: 'cookedCount', value: 0 } },
        { type: 'leaf', actionId: 'gain', sourceCard: 'C53_GypsysCrock', params: { food: 1 } },
      ],
    })
  })

  it('C93 InnerDistrictsDirector adds stone to paired space by flow only', () => {
    const p = player('C93_InnerDistrictsDirector')
    const forest = space('forest', { takenBy: [{ playerId: p.id, workerId: '1' }] })
    const clayPit = space('clay-pit')
    const game = state([p], { actionSpaces: [forest, clayPit] })
    const before = stateSnapshot(game)

    const result = listenerById(C93_InnerDistrictsDirector_impl.listeners, 'C93-inner-districts-director-after-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after', space: forest }))

    expectUnchanged(before, game)
    expect(firstLeaf(result?.flow)).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C93_InnerDistrictsDirector',
      params: { kind: 'add-resource-to-space', spaceId: 'clay-pit', resource: 'stone', amount: 1 },
    })
  })

  it('C130 OutskirtsDirector adds reed to paired space by flow only', () => {
    const p = player('C130_OutskirtsDirector')
    const grove = space('grove', { takenBy: [{ playerId: p.id, workerId: '1' }] })
    const hollow = space('hollow')
    const game = state([p], { actionSpaces: [grove, hollow] })
    const before = stateSnapshot(game)

    const result = listenerById(C130_OutskirtsDirector_impl.listeners, 'C130-outskirts-director-after-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after', space: grove }))

    expectUnchanged(before, game)
    expect(firstLeaf(result?.flow)).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C130_OutskirtsDirector',
      params: { kind: 'add-resource-to-space', spaceId: 'hollow', resource: 'reed', amount: 2 },
    })
  })

  it('C150 ParrotBreeder self placement clears tracker and flag by flow only', () => {
    const p = player('C150_ParrotBreeder', {
      cardStates: { C150_ParrotBreeder: { flagged: true, extraData: { right: 'forest' } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C150_ParrotBreeder_impl.listeners, 'C150-parrot-breeder-after-self-place')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C150_ParrotBreeder', params: { kind: 'set-extra-data', key: 'right', value: null } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C150_ParrotBreeder', params: { kind: 'set-flag', flag: false } },
      ],
    })
  })

  it('C150 ParrotBreeder self placement does not dispatch a no-op clear flow', () => {
    const p = player('C150_ParrotBreeder', {
      cardStates: { C150_ParrotBreeder: { flagged: false, extraData: { right: null } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C150_ParrotBreeder_impl.listeners, 'C150-parrot-breeder-after-self-place')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result).toBeUndefined()
  })

  it('C150 ParrotBreeder opponent placement updates right-neighbour tracker by flow only', () => {
    const owner = player('C150_ParrotBreeder', {
      id: 'owner',
      name: 'Owner',
      occupationPlayed: ['C150_ParrotBreeder'],
      minorPlayed: [],
      cardStates: { C150_ParrotBreeder: { flagged: true, extraData: { right: null } } },
    })
    const right = player('__right__', { id: 'right', name: 'Right', color: 'blue', minorPlayed: [], cardStates: {} })
    const left = player('__left__', { id: 'left', name: 'Left', color: 'green', minorPlayed: [], cardStates: {} })
    const forest = space('forest')
    const game = state([right, owner, left], { actionSpaces: [forest] })
    const before = stateSnapshot(game)

    const result = listenerById(C150_ParrotBreeder_impl.listeners, 'C150-parrot-breeder-after-opponent-place')
      .handler(context(owner, {
        state: game,
        player: right,
        triggerPlayer: right,
        ownerPlayer: owner,
        effectPlayer: owner,
        actionId: 'place-farmer',
        phase: 'after',
        space: forest,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C150_ParrotBreeder', actionContext: { targetPlayerId: owner.id }, params: { kind: 'set-extra-data', key: 'right', value: 'forest' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C150_ParrotBreeder', actionContext: { targetPlayerId: owner.id }, params: { kind: 'set-flag', flag: false } },
      ],
    })
  })

  it('C150 ParrotBreeder opponent placement does not dispatch when tracker is already clear', () => {
    const owner = player('C150_ParrotBreeder', {
      id: 'owner',
      name: 'Owner',
      occupationPlayed: ['C150_ParrotBreeder'],
      minorPlayed: [],
      cardStates: { C150_ParrotBreeder: { flagged: false, extraData: { right: null } } },
    })
    const right = player('__right__', { id: 'right', name: 'Right', color: 'blue', minorPlayed: [], cardStates: {} })
    const left = player('__left__', { id: 'left', name: 'Left', color: 'green', minorPlayed: [], cardStates: {} })
    const forest = space('forest')
    const game = state([right, owner, left], { actionSpaces: [forest] })
    const before = stateSnapshot(game)

    const result = listenerById(C150_ParrotBreeder_impl.listeners, 'C150-parrot-breeder-after-opponent-place')
      .handler(context(owner, {
        state: game,
        player: left,
        triggerPlayer: left,
        ownerPlayer: owner,
        effectPlayer: owner,
        actionId: 'place-farmer',
        phase: 'after',
        space: forest,
      }))

    expectUnchanged(before, game)
    expect(result).toBeUndefined()
  })

  it('D36 BreedRegistry after-collect stores sheep counter and infobox by flow only', () => {
    const p = player('D36_BreedRegistry', {
      cardStates: { D36_BreedRegistry: { extraData: { sheepGained: 1 }, infobox: '1 / 2' } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(D36_BreedRegistry_impl.listeners, 'D36-breed-registry-after-collect')
      .handler(context(p, { state: game, actionId: 'collect', phase: 'after', result: { type: 'ok', resourcesGained: { sheep: 1 } } }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'D36_BreedRegistry', params: { kind: 'set-extra-data', key: 'sheepGained', value: 2 } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'D36_BreedRegistry', params: { kind: 'set-infobox', text: '2 / 2' } },
      ],
    })
  })

  it('D36 BreedRegistry before-exchange snapshots sheep by flow only', () => {
    const p = player('D36_BreedRegistry', { resources: resource({ sheep: 2 }) })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(D36_BreedRegistry_impl.listeners, 'D36-breed-registry-before-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D36_BreedRegistry',
      params: { kind: 'set-extra-data', key: 'sheepBeforeExchange', value: 2 },
    })
  })

  it('D56 FatstockStretcher before-exchange snapshots animals by flow only', () => {
    const p = player('D56_FatstockStretcher', { resources: resource({ sheep: 2, boar: 1 }) })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(D56_FatstockStretcher_impl.listeners, 'D56-fatstock-stretcher-before-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'D56_FatstockStretcher', params: { kind: 'set-extra-data', key: 'sheepBefore', value: 2 } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'D56_FatstockStretcher', params: { kind: 'set-extra-data', key: 'boarBefore', value: 1 } },
      ],
    })
  })

  it('D74 RoyalWood before-action snapshots wood by flow only', () => {
    const p = player('D74_RoyalWood', { resources: resource({ wood: 5 }) })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(D74_RoyalWood_impl.listeners, 'D74-royal-wood-before')
      .handler(context(p, { state: game, actionId: 'construct', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D74_RoyalWood',
      params: { kind: 'set-extra-data', key: 'woodBefore', value: 5 },
    })
  })

  it('D74 RoyalWood after-pay accumulates wood spent by flow only', () => {
    const p = player('D74_RoyalWood', {
      cardStates: { D74_RoyalWood: { extraData: { woodSpent: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(D74_RoyalWood_impl.listeners, 'D74-royal-wood-after-pay')
      .handler(context(p, {
        state: game,
        actionId: 'pay',
        phase: 'after',
        actionContext: { costType: 'minor-improvement' },
        result: { type: 'ok', resourcesPaid: { wood: 2 } },
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D74_RoyalWood',
      params: { kind: 'set-extra-data', key: 'woodSpent', value: 3 },
    })
  })

  it('D158 BeanCounter increments counter by flow only before threshold', () => {
    const p = player('D158_BeanCounter', {
      cardStates: { D158_BeanCounter: { counters: { food: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(D158_BeanCounter_impl.listeners, 'D158-bean-counter-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after', space: space('round-5', { roundAvailable: 5 }) }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D158_BeanCounter',
      params: { kind: 'set-counter', key: 'food', value: 2 },
    })
  })

  it('E53 BoarSpear marks used token by flow before optional exchange', () => {
    const p = player('E53_BoarSpear')
    recordActionSnapshot(p, 11)
    const game = state([p], { roundPhase: 'work' })
    const before = stateSnapshot(game)

    const result = listenerById(E53_BoarSpear_impl.listeners, 'E53-boar-spear-after-obtain')
      .handler(context(p, { state: game, actionId: 'collect', phase: 'after', result: { type: 'ok', resourcesGained: { boar: 1 } } }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E53_BoarSpear', params: { kind: 'set-extra-data', key: 'E53UsedActionToken', value: 11 } },
        { type: 'leaf', actionId: 'exchange', sourceCard: 'E53_BoarSpear' },
      ],
    })
  })

  it('E74 AshTrees after-fence clears pending bonus and refreshes infobox by flow only', () => {
    const p = player('E74_AshTrees', {
      cardStates: { E74_AshTrees: { counters: { fences: 3 }, infobox: 'stale' } },
    })
    storePendingFenceBonus(p, { sourceCard: 'E74_AshTrees', counterKey: 'fences', freeFences: 2 })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(E74_AshTrees_impl.listeners, 'E74-ash-trees-after-fence')
      .handler(context(p, { state: game, actionId: 'fence', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E74_AshTrees', params: { kind: 'clear-pending-fence-bonus' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E74_AshTrees', params: { kind: 'set-infobox', text: '3 / 5' } },
      ],
    })
  })

  it('C88 CarpentersApprentice after-fence clears pending bonus by flow only', () => {
    const p = player('C88_CarpentersApprentice')
    storePendingFenceBonus(p, { sourceCard: 'C88_CarpentersApprentice', counterKey: 'fencesDiscounted', freeFences: 2 })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C88_CarpentersApprentice_impl.listeners, 'C88-carpenters-apprentice-after-fence')
      .handler(context(p, { state: game, actionId: 'fence', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C88_CarpentersApprentice',
      params: { kind: 'clear-pending-fence-bonus' },
    })
  })

  it('E85 MasterTanner before-exchange snapshots animals by flow only', () => {
    const p = player('E85_MasterTanner', { resources: resource({ boar: 2, cattle: 1 }) })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(E85_MasterTanner_impl.listeners, 'E85-master-tanner-before-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E85_MasterTanner', params: { kind: 'set-extra-data', key: 'boarBefore', value: 2 } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E85_MasterTanner', params: { kind: 'set-extra-data', key: 'cattleBefore', value: 1 } },
      ],
    })
  })

  it('E148 Lazybones removes reserved space and builds stable by owner-targeted flow only', () => {
    const owner = player('E148_Lazybones', {
      id: 'owner',
      name: 'Owner',
      occupationPlayed: ['E148_Lazybones'],
      minorPlayed: [],
      roomTiles: [{ row: 0, col: 0 }],
      cardStates: { E148_Lazybones: { extraData: { reservedActionSpaces: ['grain-seeds', 'farmland'] } } },
    })
    const trigger = player('__trigger__', { id: 'trigger', name: 'Trigger', color: 'blue', minorPlayed: [], cardStates: {} })
    const grainSeeds = space('grain-seeds')
    const game = state([owner, trigger], { actionSpaces: [grainSeeds] })
    const before = stateSnapshot(game)

    const result = listenerById(E148_Lazybones_impl.listeners, 'E148-lazybones-opponent-trigger')
      .handler(context(owner, {
        state: game,
        player: trigger,
        triggerPlayer: trigger,
        ownerPlayer: owner,
        effectPlayer: owner,
        actionId: 'place-farmer',
        phase: 'after',
        space: grainSeeds,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E148_Lazybones', actionContext: { targetPlayerId: owner.id }, params: { kind: 'set-extra-data', key: 'reservedActionSpaces', value: ['farmland'] } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E148_Lazybones', actionContext: { targetPlayerId: owner.id }, params: { kind: 'build-stable-on-first-empty-tile' } },
      ],
    })
  })
})
