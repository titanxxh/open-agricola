import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import {
  deriveVirtualTileCol,
  getFarmyardFields,
  getLogicalFields,
  makeCardFieldImpl,
  mutateLogicalFields,
} from '../card-field'
import { reap } from '../../../actions/effects/reap'

const emptyResources = () => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: emptyResources(),
  workers: [],
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
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  cardStates: {},
  ...overrides,
} as PlayerState)

const createState = (player: PlayerState): GameState => ({
  round: 1,
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
} as GameState)

describe('logical field boundary', () => {
  it.each([2, 4])('reaps %i crops across layers without adding a logical field or slot', (count) => {
    const cardId = 'D025_WitchesDanceFloor'
    makeCardFieldImpl(cardId, { allowedCrops: ['grain'], capacity: 1 })
    const player = createPlayer({ minorPlayed: [cardId] })
    const state = createState(player)
    const mutations = mutateLogicalFields(state, player)
    const target = { fieldId: `card:${cardId}`, slot: 0 }
    expect(mutations.place(target, 'grain', 1).ok).toBe(true)
    expect(mutations.insertBottom(target, 'vegetable', 2).ok).toBe(true)
    expect(mutations.insertBottom(target, 'grain', 1).ok).toBe(true)
    const fields = getLogicalFields(player)
    expect(fields).toHaveLength(1)
    expect(fields[0]!.slots).toHaveLength(1)
    expect(fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 1 }, { kind: 'vegetable', remaining: 2 }, { kind: 'grain', remaining: 1 },
    ])
    expect(Object.isFrozen(fields[0]!.slots[0]!.layers[0])).toBe(true)
    const result = reap(state, player, undefined, {
      harvestCounts: { '-1-4025': { count, scope: count === 4 ? 'field' : 'top-stack' } },
    })
    expect(result.reapSummary.resources).toEqual(count === 4 ? { grain: 2, vegetable: 2 } : { grain: 1, vegetable: 1 })
    expect(getLogicalFields(player)[0]!.stacks).toEqual(count === 4 ? [] : [
      { kind: 'grain', remaining: 1 }, { kind: 'vegetable', remaining: 1 },
    ])
  })

  it('retains a buried crop for last-crop callbacks and preserves layers when growing or replacing the top', () => {
    const cardId = 'A001_LayeredTestField'
    const removed: Array<{ crop: string; isLast: boolean }> = []
    makeCardFieldImpl(cardId, { allowedCrops: ['grain', 'vegetable'], capacity: 1 }, {
      onCropRemoved: ({ crop, isLast }) => { removed.push({ crop, isLast }) },
    })
    const player = createPlayer({ minorPlayed: [cardId] })
    const mutations = mutateLogicalFields(createState(player), player)
    const target = { fieldId: `card:${cardId}`, slot: 0 }
    expect(mutations.place(target, 'grain', 1).ok).toBe(true)
    expect(mutations.insertBottom(target, 'grain', 1).ok).toBe(true)
    expect(mutations.grow(target).ok).toBe(true)
    expect(mutations.remove(target, 2).ok).toBe(true)
    expect(removed).toEqual([{ crop: 'grain', isLast: false }])
    expect(mutations.insertBottom(target, 'vegetable', 1).ok).toBe(true)
    expect(mutations.replace(target, 'vegetable', 2).ok).toBe(true)
    expect(getLogicalFields(player)[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 }, { kind: 'vegetable', remaining: 2 },
    ])
    expect(mutations.place(target, 'grain', 3).ok).toBe(false)
    expect(mutations.remove(target).ok).toBe(true)
    expect(mutations.remove(target).ok).toBe(true)
    expect(mutations.place(target, 'grain', 3).ok).toBe(true)
  })

  it('projects deterministic immutable Farmyard and Card Fields with fixed stable slots', () => {
    makeCardFieldImpl('D075_WoodField', { allowedCrops: ['wood'], capacity: 2 })
    const player = createPlayer({
      fields: [
        { row: 1, col: 2, stacks: [] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      ],
      minorPlayed: ['D075_WoodField'],
      cardStates: {
        D075_WoodField: {
          extraData: { cardFieldStacks: [null, { crop: 'wood', remaining: 2 }] },
        },
      },
    })

    const fields = getLogicalFields(player)

    expect(fields.map((field) => field.id)).toEqual([
      'farmyard:0:1',
      'farmyard:1:2',
      'card:D075_WoodField',
    ])
    expect(fields[2]).toMatchObject({
      kind: 'card',
      row: -1,
      col: 4075,
      sourceCard: 'D075_WoodField',
      groupKey: 'D075_WoodField',
      stacks: [{ kind: 'wood', remaining: 2 }],
      slots: [
        { index: 0, tile: { row: -1, col: 4075 }, stack: null },
        { index: 1, tile: { row: -1, col: 4076 }, stack: { kind: 'wood', remaining: 2 } },
      ],
    })
    expect(Object.isFrozen(fields)).toBe(true)
    expect(Object.isFrozen(fields[2]?.slots)).toBe(true)
    expect(getFarmyardFields(player).map((field) => field.id)).toEqual([
      'farmyard:0:1',
      'farmyard:1:2',
    ])
    expect(player.fields[0]?.row).toBe(1)
  })

  it('persists named mutations through both owners without renumbering Card Field slots', () => {
    makeCardFieldImpl('D075_WoodField', { allowedCrops: ['wood'], capacity: 2 })
    const player = createPlayer({
      fields: [{ row: 0, col: 0, stacks: [] }],
      minorPlayed: ['D075_WoodField'],
      cardStates: {
        D075_WoodField: {
          extraData: {
            cardFieldStacks: [
              { crop: 'wood', remaining: 1 },
              { crop: 'wood', remaining: 2 },
            ],
          },
        },
      },
    })
    const mutations = mutateLogicalFields(createState(player), player)

    expect(mutations.place({ fieldId: 'farmyard:0:0' }, 'stone', 1)).toEqual({ ok: true })
    expect(mutations.remove({ fieldId: 'card:D075_WoodField', slot: 0 })).toMatchObject({
      ok: true,
      crop: 'wood',
      amount: 1,
    })

    expect(player.fields[0]?.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
    expect(player.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      null,
      { crop: 'wood', remaining: 2 },
    ])
    expect(getLogicalFields(player)[1]?.slots[1]).toMatchObject({
      index: 1,
      tile: { row: -1, col: 4076 },
      stack: { kind: 'wood', remaining: 2 },
    })
  })

  it('limits off-crop Card Field placement to an explicit card-effect bypass', () => {
    makeCardFieldImpl('D075_WoodField', { allowedCrops: ['wood'], capacity: 2 })
    const player = createPlayer({ minorPlayed: ['D075_WoodField'] })
    const state = createState(player)

    expect(mutateLogicalFields(state, player).place(
      { fieldId: 'card:D075_WoodField' },
      'stone',
      1,
    )).toEqual({ ok: false, error: 'invalid-crop' })

    const cardEffectMutations = mutateLogicalFields(state, player, { allowNonSowCrop: true })
    expect(cardEffectMutations.place(
      { fieldId: 'card:D075_WoodField' },
      'stone',
      1,
    )).toEqual({ ok: true })
    expect(getLogicalFields(player)[0]?.slots).toEqual([
      expect.objectContaining({ index: 0, stack: { kind: 'stone', remaining: 1 } }),
      expect.objectContaining({ index: 1, stack: null }),
    ])
    expect(cardEffectMutations.replace(
      { fieldId: 'card:D075_WoodField' },
      'grain',
      3,
    )).toEqual({ ok: false, error: 'invalid-crop' })
  })

  it('fails malformed Card Field state before changing either owner', () => {
    makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
    const player = createPlayer({
      fields: [{ row: 0, col: 0, stacks: [] }],
      minorPlayed: ['B068_Beanfield'],
      cardStates: {
        B068_Beanfield: {
          extraData: {
            cardFieldStacks: [
              { crop: 'vegetable', remaining: 2 },
              { crop: 'vegetable', remaining: 2 },
            ],
          },
        },
      },
    })

    expect(() => mutateLogicalFields(createState(player), player).place(
      { fieldId: 'farmyard:0:0' },
      'grain',
      3,
    )).toThrow(/B068_Beanfield/)
    expect(player.fields[0]?.stacks).toEqual([])
    expect(player.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toHaveLength(2)
  })

  it('rejects stale replacement atomically and dispatches Card Field removal callbacks', () => {
    const events: DraftGameEvent[] = []
    const eventSink: EventSink = {
      emit: (event) => { events.push(event) },
      emitMany: (nextEvents) => { events.push(...nextEvents) },
    }
    let removed = false
    makeCardFieldImpl('A001_TestField', { allowedCrops: ['grain'], capacity: 1 }, {
      onCropRemoved: () => {
        removed = true
        return { type: 'leaf', actionId: 'noop', sourceCard: 'A001_TestField' }
      },
    })
    const player = createPlayer({
      minorPlayed: ['A001_TestField'],
      cardStates: {
        A001_TestField: {
          extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
        },
      },
    })
    const mutations = mutateLogicalFields(createState(player), player, {
      sourceCard: 'A002_TestRemover',
      eventSink,
    })

    expect(mutations.replace({ row: -1, col: 1001 }, 'vegetable', 2)).toEqual({
      ok: false,
      error: 'invalid-crop',
    })
    expect(player.cardStates.A001_TestField?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 2 },
    ])
    expect(events).toEqual([])

    expect(mutations.remove({ row: -1, col: 1001 })).toMatchObject({
      ok: true,
      crop: 'grain',
      amount: 2,
      flow: { type: 'leaf', actionId: 'noop' },
    })
    expect(removed).toBe(true)
    expect(player.cardStates.A001_TestField?.extraData?.cardFieldStacks).toEqual([null])
    expect(events).toEqual([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: 'A002_TestRemover',
        crops: [{
          location: { kind: 'card', playerId: player.id, cardId: 'A001_TestField' },
          crop: 'grain',
          amount: 2,
        }],
      }),
    ])
  })
})

describe('makeCardFieldImpl', () => {
  describe('virtualTileCol derivation', () => {
    it('B68 → 2068, E68 → 5068 (no collision)', () => {
      expect(deriveVirtualTileCol('B068_Beanfield', 0)).toBe(2068)
      expect(deriveVirtualTileCol('E068_CherryOrchard', 0)).toBe(5068)
    })
    it('D75 capacity=2 occupies 4075..4076', () => {
      expect(deriveVirtualTileCol('D075_WoodField', 0)).toBe(4075)
      expect(deriveVirtualTileCol('D075_WoodField', 1)).toBe(4076)
    })
    it('E80 capacity=3 occupies 5080..5082', () => {
      expect(deriveVirtualTileCol('E080_RockGarden', 0)).toBe(5080)
      expect(deriveVirtualTileCol('E080_RockGarden', 2)).toBe(5082)
    })
  })

  describe('onComputeSowableFields', () => {
    it('returns empty when stacks full', () => {
      const impl = makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const player = createPlayer({
        cardStates: { B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } } },
      })
      expect(impl.effect.onComputeSowableFields!(player)).toEqual([])
    })
    it('returns one slot when empty (capacity=1)', () => {
      const impl = makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const fields = impl.effect.onComputeSowableFields!(createPlayer())
      expect(fields).toHaveLength(1)
      expect(fields[0]).toMatchObject({ tile: { row: -1, col: 2068 }, allowedCrops: ['vegetable'], sourceCard: 'B068_Beanfield' })
    })
  })

  describe('onSowExtraField', () => {
    it('deducts crop and pushes stack', () => {
      const impl = makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const player = createPlayer()
      player.resources.vegetable = 1
      const ok = impl.effect.onSowExtraField!(player, { row: -1, col: 2068 }, 'vegetable')
      expect(ok).toBe(true)
      expect(player.resources.vegetable).toBe(0)
      expect(player.cardStates!.B068_Beanfield.extraData.cardFieldStacks).toEqual([{ crop: 'vegetable', remaining: 2 }])
    })
    it('rejects wrong crop', () => {
      const impl = makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const player = createPlayer()
      player.resources.grain = 1
      const ok = impl.effect.onSowExtraField!(player, { row: -1, col: 2068 }, 'grain')
      expect(ok).toBe(false)
      expect(player.resources.grain).toBe(1)
    })
  })

  describe('shared reap: summary accumulation', () => {
    it('累加到 summary.resources[crop]', () => {
      makeCardFieldImpl('D075_WoodField', { allowedCrops: ['wood'], capacity: 2 })
      const player = createPlayer({
        minorPlayed: ['D075_WoodField'],
        cardStates: { D075_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }, { crop: 'wood', remaining: 3 }] } } },
      })
      const state = createState(player)
      const result = reap(state, player)
      expect(result.reapSummary.resources.wood).toBe(2)
      expect(result.reapSummary.harvestedPositions).toEqual([
        { row: -1, col: 4075 },
      ])
      expect(player.resources.wood).toBe(2)
      expect(player.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
        null,
        { crop: 'wood', remaining: 2 },
      ])
    })
  })

  describe('shared reap: isLast semantics', () => {
    it('isLast=false when more remaining on card', () => {
      let received: { crop: string; isLast: boolean } | null = null
      makeCardFieldImpl('D075_WoodField', { allowedCrops: ['wood'], capacity: 2 }, {
        onReap: (ctx) => { received = { crop: ctx.crop, isLast: ctx.isLast } },
      })
      const player = createPlayer({
        minorPlayed: ['D075_WoodField'],
        cardStates: { D075_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      reap(state, player)
      expect(received).toEqual({ crop: 'wood', isLast: false })
    })
    it('isLast=true when last unit on card', () => {
      let received: { crop: string; isLast: boolean } | null = null
      makeCardFieldImpl('E068_CherryOrchard', { allowedCrops: ['wood'], capacity: 1 }, {
        onReap: (ctx) => { received = { crop: ctx.crop, isLast: ctx.isLast } },
      })
      const player = createPlayer({
        minorPlayed: ['E068_CherryOrchard'],
        cardStates: { E068_CherryOrchard: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      reap(state, player)
      expect(received).toEqual({ crop: 'wood', isLast: true })
      expect(player.cardStates!.E068_CherryOrchard.extraData.cardFieldStacks).toEqual([null])
    })
    it('multi-crop: each crop reports isLast independently', () => {
      const received: { crop: string; isLast: boolean }[] = []
      makeCardFieldImpl('E070_CropRotationField', { allowedCrops: ['grain', 'vegetable'], capacity: 2 }, {
        onReap: (ctx) => { received.push({ crop: ctx.crop, isLast: ctx.isLast }) },
      })
      const player = createPlayer({
        minorPlayed: ['E070_CropRotationField'],
        cardStates: { E070_CropRotationField: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }, { crop: 'vegetable', remaining: 1 }] } } },
      })
      const state = createState(player)
      reap(state, player)
      expect(received).toHaveLength(2)
      expect(received).toEqual(expect.arrayContaining([
        { crop: 'grain', isLast: true },
        { crop: 'vegetable', isLast: true },
      ]))
    })
  })

  describe('shared reap: ActionFlow collection', () => {
    it('single onReap flow → wrap in parallel', () => {
      makeCardFieldImpl('E068_CherryOrchard', { allowedCrops: ['wood'], capacity: 1 }, {
        onReap: () => ({ type: 'leaf', actionId: 'noop', sourceCard: 'E068_CherryOrchard' }),
      })
      const player = createPlayer({
        minorPlayed: ['E068_CherryOrchard'],
        cardStates: { E068_CherryOrchard: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      const flow = reap(state, player).reactionFlow
      expect(flow).toMatchObject({
        type: 'parallel',
        children: [{ type: 'leaf', actionId: 'noop' }],
      })
    })
    it('multiple onReap flows → wrap in parallel', () => {
      makeCardFieldImpl('E070_CropRotationField', { allowedCrops: ['grain', 'vegetable'], capacity: 2 }, {
        onReap: (ctx) => ({ type: 'leaf', actionId: `flow-${ctx.crop}`, sourceCard: 'E070_CropRotationField' }),
      })
      const player = createPlayer({
        minorPlayed: ['E070_CropRotationField'],
        cardStates: { E070_CropRotationField: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }, { crop: 'vegetable', remaining: 1 }] } } },
      })
      const state = createState(player)
      const flow = reap(state, player).reactionFlow as { type: 'parallel'; children: any[] }
      expect(flow.type).toBe('parallel')
      expect(flow.children).toHaveLength(2)
    })
  })

  describe('sow-isDoable listener', () => {
    it('returns doable when main fields full + cardField empty + crop in hand', () => {
      const impl = makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const listener = impl.listeners[0]
      expect(listener.actions).toContain('sow')
      const player = createPlayer()
      player.resources.vegetable = 1
      const result = listener.handler({ state: createState(player), player, space: {} as any, actionId: 'sow', phase: 'isDoable' } as any)
      expect(result).toEqual({ doable: true })
    })
    it('returns undefined when no allowed crop in hand', () => {
      const impl = makeCardFieldImpl('B068_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const listener = impl.listeners[0]
      const player = createPlayer()
      const result = listener.handler({ state: createState(player), player, space: {} as any, actionId: 'sow', phase: 'isDoable' } as any)
      expect(result).toBeUndefined()
    })
  })
})
