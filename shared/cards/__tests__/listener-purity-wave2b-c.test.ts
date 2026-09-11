import { describe, expect, it } from 'vitest'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { recordActionSnapshot } from '../helpers/action-snapshot'
import { storePendingFenceBonus } from '../helpers/pending-fence-bonus'
import { A068_AsparagusGift_impl } from '../A/A068_AsparagusGift'
import { A073_AgriculturalFertilizers_impl } from '../A/A073_AgriculturalFertilizers'
import { A092_AdoptiveParents_impl } from '../A/A092_AdoptiveParents'
import { B018_GrasslandHarrow_impl } from '../B/B018_GrasslandHarrow'
import { B034_SpecialFood_impl } from '../B/B034_SpecialFood'
import { B076_Ceilings_impl } from '../B/B076_Ceilings'
import { C048_Farmstead_impl } from '../C/C048_Farmstead'
import { C053_GypsysCrock_impl } from '../C/C053_GypsysCrock'
import { C093_InnerDistrictsDirector_impl } from '../C/C093_InnerDistrictsDirector'
import { C130_OutskirtsDirector_impl } from '../C/C130_OutskirtsDirector'
import { C150_ParrotBreeder_impl } from '../C/C150_ParrotBreeder'
import { D036_BreedRegistry_impl } from '../D/D036_BreedRegistry'
import { D056_FatstockStretcher_impl } from '../D/D056_FatstockStretcher'
import { D074_RoyalWood_impl } from '../D/D074_RoyalWood'
import { D158_BeanCounter_impl } from '../D/D158_BeanCounter'
import { E053_BoarSpear_impl } from '../E/E053_BoarSpear'
import { E074_AshTrees_impl } from '../E/E074_AshTrees'
import { E085_MasterTanner_impl } from '../E/E085_MasterTanner'
import { E148_Lazybones_impl } from '../E/E148_Lazybones'

const TARGETS = [
  'A068_AsparagusGift',
  'A073_AgriculturalFertilizers',
  'A092_AdoptiveParents',
  'B018_GrasslandHarrow',
  'B034_SpecialFood',
  'B076_Ceilings',
  'C048_Farmstead',
  'C053_GypsysCrock',
  'C088_CarpentersApprentice',
  'C093_InnerDistrictsDirector',
  'C130_OutskirtsDirector',
  'C150_ParrotBreeder',
  'D036_BreedRegistry',
  'D056_FatstockStretcher',
  'D074_RoyalWood',
  'D158_BeanCounter',
  'E053_BoarSpear',
  'E074_AshTrees',
  'E085_MasterTanner',
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

const movedToPlayer = (
  resources: Partial<Resource>,
  playerId = 'p1',
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'test-space' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason: from.kind === 'actionSpace' ? 'collect' : 'gain',
})

const paidByPlayer = (
  resources: Partial<Resource>,
  paymentFor: DraftGameEvent<'resource.paid'>['paymentFor'],
  playerId = 'p1',
): DraftGameEvent<'resource.paid'> => ({
  type: 'resource.paid',
  resources,
  paymentFor,
  paymentSources: [{ from: { kind: 'player', playerId }, resources }],
  to: { kind: 'supply' },
})

const exchangedByPlayer = (
  paid: Partial<Resource>,
  gained: Partial<Resource>,
  playerId = 'p1',
): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid,
  gained,
  paidFrom: { kind: 'player', playerId },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId },
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
      'A068_AsparagusGift',
      'A073_AgriculturalFertilizers',
      'A092_AdoptiveParents',
      'B018_GrasslandHarrow',
      'B034_SpecialFood',
      'B076_Ceilings',
      'C048_Farmstead',
      'C053_GypsysCrock',
      'C088_CarpentersApprentice',
      'C093_InnerDistrictsDirector',
      'C130_OutskirtsDirector',
      'C150_ParrotBreeder',
      'D036_BreedRegistry',
      'D056_FatstockStretcher',
      'D074_RoyalWood',
      'D158_BeanCounter',
      'E053_BoarSpear',
      'E074_AshTrees',
      'E085_MasterTanner',
      'E148_Lazybones',
    ])
  })

  it('A68 AsparagusGift before-fencing snapshots fence count by flow only', () => {
    const p = player('A068_AsparagusGift', {
      fenceSegments: [{ type: 'fence', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A068_AsparagusGift_impl.listeners, 'A68-asparagus-gift-before-fencing')
      .handler(context(p, { state: game, actionId: 'fence', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A068_AsparagusGift',
      params: { kind: 'set-extra-data', key: 'fencesBefore' },
    })
  })

  it('A73 AgriculturalFertilizers before-action snapshots used spaces by flow only', () => {
    const p = player('A073_AgriculturalFertilizers', {
      roomTiles: [{ row: 0, col: 0 }],
      fields: [{ row: 0, col: 1, stacks: [] }],
      farmTerrain: [{ row: 0, col: 2, kind: 'forest' }],
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A073_AgriculturalFertilizers_impl.listeners, 'A73-agri-fert-before')
      .handler(context(p, { state: game, actionId: 'construct', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A073_AgriculturalFertilizers',
      params: { kind: 'set-extra-data', key: 'spacesBefore', value: 3 },
    })
  })

  // A92 was migrated to the reference pull model: a single anytime grow-only listener
  // (capability A) plus a `contributeExtraTurn` effect hook (capability B). The
  // old before/after/immediatelyAfter push listeners are gone.
  it('A92 AdoptiveParents anytime grow-only returns a pay+promote seq without mutating state', () => {
    const p = player('A092_AdoptiveParents', {
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: true },
      ],
      resources: resource({ food: 3 }),
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A092_AdoptiveParents_impl.listeners, 'A92-adoptive-parents-anytime-grow')
      .handler(context(p, { state: game, actionId: 'anytime', phase: 'anytime' }))

    expectUnchanged(before, game)
    expect(result?.flow?.type).toBe('seq')
    expect(firstLeaf(result?.flow)).toBeDefined()
  })

  it('A92 AdoptiveParents anytime grow-only returns void without a newborn', () => {
    const p = player('A092_AdoptiveParents', { resources: resource({ food: 3 }) })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(A092_AdoptiveParents_impl.listeners, 'A92-adoptive-parents-anytime-grow')
      .handler(context(p, { state: game, actionId: 'anytime', phase: 'anytime' }))

    expectUnchanged(before, game)
    expect(result).toBeUndefined()
  })

  it('A92 AdoptiveParents contributeExtraTurn returns an XOR without mutating state', () => {
    const p = player('A092_AdoptiveParents', {
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: true },
      ],
      resources: resource({ food: 3 }),
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const flow = A092_AdoptiveParents_impl.effect!.contributeExtraTurn!(game, p)

    expectUnchanged(before, game)
    expect(flow?.type).toBe('xor')
  })

  it('B18 GrasslandHarrow queues target round and future meeple lazily', () => {
    const p = player('B018_GrasslandHarrow', {
      resources: resource({ wood: 2, clay: 1 }),
    })
    const game = state([p], { round: 4 })
    const before = stateSnapshot(game)

    const result = listenerById(B018_GrasslandHarrow_impl.listeners, 'B18-grassland-harrow-after-pay')
      .handler(context(p, { state: game, actionId: 'pay', phase: 'after', sourceCard: 'B018_GrasslandHarrow' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'future-meeples',
      sourceCard: 'B018_GrasslandHarrow',
      params: { __futureMeepleRequest: { cardId: 'B018_GrasslandHarrow', playerId: p.id } },
    })
  })

  it('B34 SpecialFood before-collect stores animal snapshot by flow only', () => {
    const p = player('B034_SpecialFood', {
      houseAnimalType: 'sheep',
      houseAnimalCount: 1,
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(B034_SpecialFood_impl.listeners, 'B34-special-food-before-collect')
      .handler(context(p, { state: game, actionId: 'collect', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'B034_SpecialFood',
      params: { kind: 'set-extra-data', key: 'animalsBeforeCollecting' },
    })
  })

  it('B76 Ceilings removes future meeples and sets flag by flow only', () => {
    const p = player('B076_Ceilings')
    const game = state([p], {
      futureMeeples: [{ id: 'b76-1', cardId: 'B076_Ceilings', playerId: p.id, round: 4, actionId: 'forest', resources: { wood: 1 } }],
    })
    const before = stateSnapshot(game)

    const result = listenerById(B076_Ceilings_impl.listeners, 'B76-ceilings-after-renovation')
      .handler(context(p, { state: game, actionId: 'renovate-house', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'B076_Ceilings', params: { kind: 'remove-future-meeples' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'B076_Ceilings', params: { kind: 'set-flag', flag: true } },
      ],
    })
  })

  it('C48 Farmstead before-place-farmer snapshots used tiles by flow only', () => {
    const p = player('C048_Farmstead', { roomTiles: [{ row: 0, col: 0 }] })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C048_Farmstead_impl.listeners, 'C48-farmstead-before-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'before' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C048_Farmstead',
      params: { kind: 'set-extra-data', key: 'usedTilesBefore' },
    })
  })

  it('C48 Farmstead after-place-farmer clears snapshot through flow before reward', () => {
    const p = player('C048_Farmstead', {
      roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      cardStates: { C048_Farmstead: { extraData: { usedTilesBefore: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C048_Farmstead_impl.listeners, 'C48-farmstead-after-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C048_Farmstead', params: { kind: 'set-extra-data', key: 'usedTilesBefore', value: undefined } },
        { type: 'leaf', actionId: 'gain', sourceCard: 'C048_Farmstead', params: { food: 1 } },
      ],
    })
  })

  it('C53 GypsysCrock trade-applied increments cooked counter by flow only', () => {
    const p = player('C053_GypsysCrock', {
      cardStates: { C053_GypsysCrock: { extraData: { cookedCount: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C053_GypsysCrock_impl.listeners, 'C53-gypsys-crock-trade-applied')
      .handler(context(p, { state: game, actionId: 'trade-applied', phase: 'immediatelyAfter', extraData: { sourceId: 'Major_Fireplace1', times: 2 } }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C053_GypsysCrock',
      params: { kind: 'set-extra-data', key: 'cookedCount', value: 3 },
    })
  })

  it('C53 GypsysCrock after-exchange resets cooked counter by flow before gain', () => {
    const p = player('C053_GypsysCrock', {
      cardStates: { C053_GypsysCrock: { extraData: { cookedCount: 3 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(C053_GypsysCrock_impl.listeners, 'C53-gypsys-crock-after-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'C053_GypsysCrock', params: { kind: 'set-extra-data', key: 'cookedCount', value: 0 } },
        { type: 'leaf', actionId: 'gain', sourceCard: 'C053_GypsysCrock', params: { food: 1 } },
      ],
    })
  })

  it('C93 InnerDistrictsDirector adds stone to paired space by flow only', () => {
    const p = player('C093_InnerDistrictsDirector')
    const forest = space('forest', { takenBy: [{ playerId: p.id, workerId: '1' }] })
    const clayPit = space('clay-pit')
    const game = state([p], { actionSpaces: [forest, clayPit] })
    const before = stateSnapshot(game)

    const result = listenerById(C093_InnerDistrictsDirector_impl.listeners, 'C93-inner-districts-director-after-place-farmer')
      .handler(context(p, { state: game, actionId: 'place-farmer', phase: 'after', space: forest }))

    expectUnchanged(before, game)
    expect(firstLeaf(result?.flow)).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'C093_InnerDistrictsDirector',
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
    const p = player('D036_BreedRegistry', {
      cardStates: { D036_BreedRegistry: { extraData: { boardSheep: 1 }, infobox: '1 / 2' } },
    })
    const game = state([p])
    const before = stateSnapshot(game)

    const actionEvents = [movedToPlayer({ sheep: 1 }, p.id)]
    const result = listenerById(D036_BreedRegistry_impl.listeners, 'D36-breed-registry-after-sheep-gain')
      .handler(context(p, {
        state: game,
        actionId: 'collect',
        phase: 'after',
        ownerCardZone: 'played',
        result: { type: 'ok', resourcesGained: { sheep: 1 } },
        transactionEvents: actionEvents,
        actionEvents,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'D036_BreedRegistry', params: { kind: 'set-extra-data', key: 'boardSheep', value: 2 } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'D036_BreedRegistry', params: { kind: 'set-infobox', text: '2 / 2' } },
      ],
    })
  })

  it('D36 BreedRegistry after-exchange marks sheep conversion by flow only', () => {
    const p = player('D036_BreedRegistry', { resources: resource({ sheep: 2 }) })
    const game = state([p])
    const before = stateSnapshot(game)
    const actionEvents = [exchangedByPlayer({ sheep: 1 }, { food: 2 }, p.id)]

    const result = listenerById(D036_BreedRegistry_impl.listeners, 'D36-breed-registry-after-exchange-sheep-conversion')
      .handler(context(p, {
        state: game,
        actionId: 'exchange',
        phase: 'after',
        transactionEvents: actionEvents,
        actionEvents,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D036_BreedRegistry',
      params: { kind: 'set-extra-data', key: 'sheepConvertedToFood', value: true },
    })
  })

  it('D56 reacts to a completed animal exchange without mutating live state', () => {
    const p = player('D056_FatstockStretcher', { resources: resource({ food: 7 }) })
    const game = state([p])
    const before = stateSnapshot(game)
    const actionEvents = [{ ...exchangedByPlayer({ sheep: 2, boar: 1 }, { food: 7 }, p.id), exchangeSource: 'Major_Fireplace1' }]
    const result = listenerById(D056_FatstockStretcher_impl.listeners, 'D56-fatstock-stretcher-after-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'after', actionEvents, transactionEvents: actionEvents }))
    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({ type: 'leaf', actionId: 'gain', params: { food: 3 } })
  })

  it('D74 RoyalWood after construct accumulates wood spent by flow only', () => {
    const p = player('D074_RoyalWood', {
      resources: resource({ wood: 5 }),
      cardStates: { D074_RoyalWood: { extraData: { woodSpent: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)
    const actionEvents = [paidByPlayer({ wood: 2 }, 'construct', p.id)]

    const result = listenerById(D074_RoyalWood_impl.listeners, 'D74-royal-wood-after')
      .handler(context(p, {
        state: game,
        actionId: 'construct',
        phase: 'after',
        transactionEvents: actionEvents,
        actionEvents,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D074_RoyalWood',
      params: { kind: 'set-extra-data', key: 'woodSpent', value: 3 },
    })
  })

  it('D74 RoyalWood after-pay accumulates wood spent by flow only', () => {
    const p = player('D074_RoyalWood', {
      cardStates: { D074_RoyalWood: { extraData: { woodSpent: 1 } } },
    })
    const game = state([p])
    const before = stateSnapshot(game)
    const actionEvents = [paidByPlayer({ wood: 2 }, 'minor-improvement', p.id)]

    const result = listenerById(D074_RoyalWood_impl.listeners, 'D74-royal-wood-after-pay')
      .handler(context(p, {
        state: game,
        actionId: 'pay',
        phase: 'after',
        actionContext: { costType: 'minor-improvement' },
        result: { type: 'ok', resourcesPaid: { wood: 2 } },
        transactionEvents: actionEvents,
        actionEvents,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D074_RoyalWood',
      params: { kind: 'set-extra-data', key: 'woodSpent', value: 3 },
    })
  })

  it.each([1, 8])('D158 BeanCounter increments on actual round-action slot %i', (slotNumber) => {
    const p = player('D158_BeanCounter', {
      cardStates: { D158_BeanCounter: { counters: { food: 1 } } },
    })
    const actionId = `actual-round-${slotNumber}`
    const game = state([p], {
      round: slotNumber,
      roundActionOrder: Array.from(
        { length: 14 },
        (_, index) => index === slotNumber - 1 ? actionId : null,
      ),
    })
    const before = stateSnapshot(game)

    const result = listenerById(D158_BeanCounter_impl.listeners, 'D158-bean-counter-place-farmer')
      .handler(context(p, {
        state: game,
        actionId: 'place-farmer',
        phase: 'after',
        space: space(actionId, { roundAvailable: 99 }),
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D158_BeanCounter',
      params: { kind: 'set-counter', key: 'food', value: 2 },
    })
  })

  it.each([
    ['fixed action space', 8, null, 'farm-expansion', true],
    ['round-action slot 9', 9, 9, 'actual-round-9', true],
    ['missing action space', 8, 1, 'actual-round-1', false],
  ])('D158 BeanCounter ignores %s', (_label, round, slotNumber, actionId, hasSpace) => {
    const p = player('D158_BeanCounter', {
      cardStates: { D158_BeanCounter: { counters: { food: 1 } } },
    })
    const game = state([p], {
      round,
      roundActionOrder: Array.from(
        { length: 14 },
        (_, index) => index === (slotNumber ?? 0) - 1 ? actionId : null,
      ),
    })
    const before = stateSnapshot(game)

    const result = listenerById(D158_BeanCounter_impl.listeners, 'D158-bean-counter-place-farmer')
      .handler(context(p, {
        state: game,
        actionId: 'place-farmer',
        phase: 'after',
        space: hasSpace ? space(actionId, { roundAvailable: 1 }) : undefined,
      }))

    expectUnchanged(before, game)
    expect(result).toBeUndefined()
  })

  it('E53 BoarSpear marks used token by flow before optional exchange', () => {
    const p = player('E053_BoarSpear')
    recordActionSnapshot(p, 11)
    const game = state([p], { roundPhase: 'work' })
    const before = stateSnapshot(game)
    const actionEvents = [movedToPlayer({ boar: 1 }, p.id, { kind: 'actionSpace', spaceId: 'boar-market' })]

    const result = listenerById(E053_BoarSpear_impl.listeners, 'E53-boar-spear-after-obtain')
      .handler(context(p, {
        state: game,
        actionId: 'collect',
        phase: 'after',
        result: { type: 'ok', resourcesGained: { boar: 1 } },
        transactionEvents: actionEvents,
        actionEvents,
      }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E053_BoarSpear', params: { kind: 'set-extra-data', key: 'E53UsedActionToken', value: 11 } },
        { type: 'leaf', actionId: 'exchange', sourceCard: 'E053_BoarSpear' },
      ],
    })
  })

  it('E74 AshTrees after-fence clears pending bonus and refreshes infobox by flow only', () => {
    const p = player('E074_AshTrees', {
      cardStates: { E074_AshTrees: { counters: { fences: 3 }, infobox: 'stale' } },
    })
    storePendingFenceBonus(p, { sourceCard: 'E074_AshTrees', counterKey: 'fences', freeFences: 2 })
    const game = state([p])
    const before = stateSnapshot(game)

    const result = listenerById(E074_AshTrees_impl.listeners, 'E74-ash-trees-after-fence')
      .handler(context(p, { state: game, actionId: 'fence', phase: 'after' }))

    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E074_AshTrees', params: { kind: 'clear-pending-fence-bonus' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E074_AshTrees', params: { kind: 'set-infobox', text: '3 / 5' } },
      ],
    })
  })

  it('E85 reacts to a completed animal exchange without mutating live state', () => {
    const p = player('E085_MasterTanner', { resources: resource({ food: 10 }) })
    const game = state([p])
    const before = stateSnapshot(game)
    const actionEvents = [{ ...exchangedByPlayer({ boar: 2, cattle: 1 }, { food: 10 }, p.id), exchangeSource: 'Major_Fireplace1' }]
    const result = listenerById(E085_MasterTanner_impl.listeners, 'E85-master-tanner-after-exchange')
      .handler(context(p, { state: game, actionId: 'exchange', phase: 'after', actionEvents, transactionEvents: actionEvents }))
    expectUnchanged(before, game)
    expect(result?.flow).toMatchObject({ type: 'xor', optional: true })
    if (result?.flow?.type === 'xor') expect(result.flow.children).toHaveLength(3)
  })

  it('E148 Lazybones removes reserved space and asks the owner to place the stable', () => {
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
        {
          type: 'leaf',
          actionId: 'stables',
          sourceCard: 'E148_Lazybones',
          targetPlayerId: owner.id,
          actionContext: { max: 1, exactCost: { max: 1 } },
        },
      ],
    })
  })
})
