import { describe, expect, it } from 'vitest'
import type { GameState, HarvestReapSummary, PlayerState } from '../../../contract/types'
import { makeCardFieldImpl, deriveVirtualTileCol } from '../card-field'

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
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
} as GameState)

const initSummary = (state: GameState, pid: string) => {
  state.harvestReapSummary = state.harvestReapSummary ?? {}
  state.harvestReapSummary[pid] = { resources: {}, grainFields: 0, vegetableFields: 0, harvestedPositions: [] } as HarvestReapSummary
}

describe('makeCardFieldImpl', () => {
  describe('virtualTileCol derivation', () => {
    it('B68 → 2068, E68 → 5068 (no collision)', () => {
      expect(deriveVirtualTileCol('B68_Beanfield', 0)).toBe(2068)
      expect(deriveVirtualTileCol('E68_CherryOrchard', 0)).toBe(5068)
    })
    it('D75 capacity=2 occupies 4075..4076', () => {
      expect(deriveVirtualTileCol('D75_WoodField', 0)).toBe(4075)
      expect(deriveVirtualTileCol('D75_WoodField', 1)).toBe(4076)
    })
    it('E80 capacity=3 occupies 5080..5082', () => {
      expect(deriveVirtualTileCol('E80_RockGarden', 0)).toBe(5080)
      expect(deriveVirtualTileCol('E80_RockGarden', 2)).toBe(5082)
    })
  })

  describe('onComputeSowableFields', () => {
    it('returns empty when stacks full', () => {
      const impl = makeCardFieldImpl('B68_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const player = createPlayer({
        cardStates: { B68_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } } },
      })
      expect(impl.effect.onComputeSowableFields!(player)).toEqual([])
    })
    it('returns one slot when empty (capacity=1)', () => {
      const impl = makeCardFieldImpl('B68_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const fields = impl.effect.onComputeSowableFields!(createPlayer())
      expect(fields).toHaveLength(1)
      expect(fields[0]).toMatchObject({ tile: { row: -1, col: 2068 }, allowedCrops: ['vegetable'], sourceCard: 'B68_Beanfield' })
    })
  })

  describe('onSowExtraField', () => {
    it('deducts crop and pushes stack', () => {
      const impl = makeCardFieldImpl('B68_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const player = createPlayer()
      player.resources.vegetable = 1
      const ok = impl.effect.onSowExtraField!(player, { row: -1, col: 2068 }, 'vegetable')
      expect(ok).toBe(true)
      expect(player.resources.vegetable).toBe(0)
      expect(player.cardStates!.B68_Beanfield.extraData.cardFieldStacks).toEqual([{ crop: 'vegetable', remaining: 2 }])
    })
    it('rejects wrong crop', () => {
      const impl = makeCardFieldImpl('B68_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const player = createPlayer()
      player.resources.grain = 1
      const ok = impl.effect.onSowExtraField!(player, { row: -1, col: 2068 }, 'grain')
      expect(ok).toBe(false)
      expect(player.resources.grain).toBe(1)
    })
  })

  describe('onHarvestFieldPhase: reapSummary accumulation', () => {
    it('累加到 summary.resources[crop]', () => {
      const impl = makeCardFieldImpl('D75_WoodField', { allowedCrops: ['wood'], capacity: 2 })
      const player = createPlayer({
        cardStates: { D75_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      initSummary(state, player.id)
      impl.effect.onHarvestFieldPhase!(state, player)
      expect(state.harvestReapSummary![player.id].resources.wood).toBe(2)
      expect(player.resources.wood).toBe(2)
    })
  })

  describe('onHarvestFieldPhase: isLast semantics', () => {
    it('isLast=false when more remaining on card', () => {
      let received: { crop: string; isLast: boolean } | null = null
      const impl = makeCardFieldImpl('D75_WoodField', { allowedCrops: ['wood'], capacity: 2 }, {
        onReap: (ctx) => { received = { crop: ctx.crop, isLast: ctx.isLast } },
      })
      const player = createPlayer({
        cardStates: { D75_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      initSummary(state, player.id)
      impl.effect.onHarvestFieldPhase!(state, player)
      expect(received).toEqual({ crop: 'wood', isLast: false })
    })
    it('isLast=true when last unit on card', () => {
      let received: { crop: string; isLast: boolean } | null = null
      const impl = makeCardFieldImpl('E68_CherryOrchard', { allowedCrops: ['wood'], capacity: 1 }, {
        onReap: (ctx) => { received = { crop: ctx.crop, isLast: ctx.isLast } },
      })
      const player = createPlayer({
        cardStates: { E68_CherryOrchard: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      initSummary(state, player.id)
      impl.effect.onHarvestFieldPhase!(state, player)
      expect(received).toEqual({ crop: 'wood', isLast: true })
      expect(player.cardStates!.E68_CherryOrchard.extraData.cardFieldStacks).toEqual([])
    })
    it('multi-crop: each crop reports isLast independently', () => {
      const received: { crop: string; isLast: boolean }[] = []
      const impl = makeCardFieldImpl('E70_CropRotationField', { allowedCrops: ['grain', 'vegetable'], capacity: 2 }, {
        onReap: (ctx) => { received.push({ crop: ctx.crop, isLast: ctx.isLast }) },
      })
      const player = createPlayer({
        cardStates: { E70_CropRotationField: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }, { crop: 'vegetable', remaining: 1 }] } } },
      })
      const state = createState(player)
      initSummary(state, player.id)
      impl.effect.onHarvestFieldPhase!(state, player)
      expect(received).toHaveLength(2)
      expect(received).toEqual(expect.arrayContaining([
        { crop: 'grain', isLast: true },
        { crop: 'vegetable', isLast: true },
      ]))
    })
  })

  describe('onHarvestFieldPhase: ActionFlow collection', () => {
    it('single onReap flow → return that flow directly', () => {
      const impl = makeCardFieldImpl('E68_CherryOrchard', { allowedCrops: ['wood'], capacity: 1 }, {
        onReap: () => ({ type: 'leaf', actionId: 'noop', sourceCard: 'E68_CherryOrchard' }),
      })
      const player = createPlayer({
        cardStates: { E68_CherryOrchard: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } } },
      })
      const state = createState(player)
      initSummary(state, player.id)
      const flow = impl.effect.onHarvestFieldPhase!(state, player)
      expect(flow).toMatchObject({ type: 'leaf', actionId: 'noop' })
    })
    it('multiple onReap flows → wrap in seq', () => {
      const impl = makeCardFieldImpl('E70_CropRotationField', { allowedCrops: ['grain', 'vegetable'], capacity: 2 }, {
        onReap: (ctx) => ({ type: 'leaf', actionId: `flow-${ctx.crop}`, sourceCard: 'E70_CropRotationField' }),
      })
      const player = createPlayer({
        cardStates: { E70_CropRotationField: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }, { crop: 'vegetable', remaining: 1 }] } } },
      })
      const state = createState(player)
      initSummary(state, player.id)
      const flow = impl.effect.onHarvestFieldPhase!(state, player) as { type: 'seq'; children: any[] }
      expect(flow.type).toBe('seq')
      expect(flow.children).toHaveLength(2)
    })
  })

  describe('sow-isDoable listener', () => {
    it('returns doable when main fields full + cardField empty + crop in hand', () => {
      const impl = makeCardFieldImpl('B68_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const listener = impl.listeners[0]
      expect(listener.actions).toContain('sow')
      const player = createPlayer()
      player.resources.vegetable = 1
      const result = listener.handler({ state: createState(player), player, space: {} as any, actionId: 'sow', phase: 'isDoable' } as any)
      expect(result).toEqual({ doable: true })
    })
    it('returns undefined when no allowed crop in hand', () => {
      const impl = makeCardFieldImpl('B68_Beanfield', { allowedCrops: ['vegetable'], capacity: 1 })
      const listener = impl.listeners[0]
      const player = createPlayer()
      const result = listener.handler({ state: createState(player), player, space: {} as any, actionId: 'sow', phase: 'isDoable' } as any)
      expect(result).toBeUndefined()
    })
  })
})
