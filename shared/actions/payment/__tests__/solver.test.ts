import { describe, expect, it, beforeEach } from 'vitest'
import { PaymentSolver } from '../index'
import type { PaymentCtx } from '../index'
import type { CostModifier, GameState, PlayerState } from '../../../contract/types'
import { InvalidActionContextError } from '../../../contract/action-context-error'

const makePlayerWithResources = (res: Partial<Record<string, number>>): PlayerState => {
  return {
    id: 'p1',
    resources: res,
    stableTiles: [],
    fenceSegments: [],
    minorHand: [],
    cardStates: {},
    activeModifiers: [],
    supplyTokensConsumed: {},
  } as unknown as PlayerState
}

const makeState = (player: PlayerState): GameState => ({
  players: [player],
} as unknown as GameState)

const fullStableTiles = () => [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
]

const setStableReserve = (player: PlayerState, reserve: number): void => {
  player.stableTiles = fullStableTiles().slice(0, 4 - reserve)
}

const setFenceReserve = (player: PlayerState, reserve: number): void => {
  player.fenceSegments = Array.from({ length: 15 - reserve }, (_, index) => ({
    edge: `H-${index}-0`,
    type: 'fence' as const,
    source: { kind: 'own' as const, ownerPlayerId: player.id },
  }))
}

const ctx: PaymentCtx = { actionId: 'test-action', costType: 'none' }

describe('PaymentSolver', () => {
  beforeEach(() => {
    PaymentSolver.clearCache()
  })

  it('rejects a deep zero-use trade list before native recursion exhausts the stack', () => {
    const state=makeState(makePlayerWithResources({food:1,wood:0}))
    const trades=Array.from({length:6000},()=>({from:{food:1},to:{wood:1},max:0}))
    expect(()=>PaymentSolver.computeOptions(state,0,{fee:{food:1},trades},ctx)).toThrow(InvalidActionContextError)
  })

  it('filters actual minimum payments before removing dominated alternatives', () => {
    const player = makePlayerWithResources({ wood: 2, stone: 2 })
    const state = makeState(player)
    const cost = { fees: [{ wood: 1 }, { wood: 1, stone: 1 }], minimumResourcesPaid: { stone: 1 } }
    expect(PaymentSolver.computeOptions(state, 0, cost, ctx).map((option) => option.resourcesPaid))
      .toEqual([{ wood: 1, stone: 1 }])
    expect(PaymentSolver.computeOptions(state, 0, { ...cost, minimumResourcesPaid: undefined }, ctx)
      .map((option) => option.resourcesPaid)).toMatchObject([{ wood: 1, stone: 0 }])
    const traded = { fee: { stone: 1 }, trades: [{ from: { wood: 1 }, to: { stone: 1 }, max: 1 }], minimumResourcesPaid: { stone: 1 } }
    expect(PaymentSolver.computeOptions(state, 0, traded, ctx).every((option) => option.resourcesPaid.stone === 1)).toBe(true)
    expect(PaymentSolver.computeOptions(state, 0, { ...cost, fees: [{ wood: 1 }] }, ctx)).toEqual([])
  })

  describe('computeOptions', () => {
    it('returns empty array when player cannot afford simple cost', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      expect(options).toEqual([])
    })

    it('returns one option for affordable simple cost', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      expect(options.length).toBe(1)
    })

    it('removes a named resource from an arbitrarily large complex fee', () => {
      const player = makePlayerWithResources({ clay: 1, reed: 0 })
      const modifier: CostModifier = {
        type: 'remove-resource',
        cardId: 'C014_StrawThatchedRoof',
        appliesTo: ['renovation'],
        resources: ['reed'],
      }
      player.activeModifiers = [modifier]

      const options = PaymentSolver.computeOptions(
        makeState(player),
        0,
        { fee: { clay: 1, reed: 1_000_000 } },
        { ...ctx, costType: 'renovation' },
      )

      expect(options).toHaveLength(1)
      expect(options[0]?.resourcesPaid.reed ?? 0).toBe(0)
      expect(options[0]?.resourcesPaid.clay).toBe(1)
      expect(options[0]?.bonusUsed).toBe('C014_StrawThatchedRoof')
      expect(options[0]?.bonusReductions).toEqual({
        C014_StrawThatchedRoof: { reed: 1_000_000 },
      })
    })

    it('does not let a later mandatory bonus reintroduce a removed resource', () => {
      const player = makePlayerWithResources({ food: 2, reed: 0, stone: 2 })
      player.activeModifiers = [{
        type: 'remove-resource',
        cardId: 'C014_StrawThatchedRoof',
        appliesTo: ['renovation'],
        resources: ['reed'],
      }]

      const options = PaymentSolver.computeOptions(
        makeState(player),
        0,
        {
          fee: { reed: 1, stone: 2 },
          bonuses: [{
            discount: { food: -2, reed: -1 },
            optional: false,
            sources: ['D013_Trowel'],
          }],
        },
        { ...ctx, costType: 'renovation' },
      )

      expect(options).toHaveLength(1)
      expect(options[0]?.resourcesPaid).toMatchObject({ food: 2, stone: 2 })
      expect(options[0]?.resourcesPaid.reed ?? 0).toBe(0)
      expect(options[0]?.bonusReductions).toMatchObject({
        C014_StrawThatchedRoof: { reed: 2 },
      })
    })

    it('merges required returned-card cost into resourcesPaid and executes supply token payment', () => {
      const player = makePlayerWithResources({ wood: 2 })
      const state = makeState(player)
      const cardCtx: PaymentCtx = {
        ...ctx,
        playedCards: ['Major_Fireplace1'],
      }
      const cost = {
        fee: { wood: 2 },
        cards: {
          type: 'Major',
          list: ['Major_Fireplace1'],
          cost: { stable: 1 },
          required: true,
        },
      }

      const options = PaymentSolver.computeOptions(state, 0, cost, cardCtx)
      expect(options).toHaveLength(1)
      expect(options[0]).toMatchObject({
        cardUsed: 'Major_Fireplace1',
        resourcesPaid: { wood: 2, stable: 1 },
      })

      const result = PaymentSolver.resolvePayment(state, 0, cost, cardCtx)
      expect(result.type).toBe('paid')
      expect(player.resources.wood).toBe(0)
      expect(player.supplyTokensConsumed?.stable).toBe(1)
      expect(player.stableTiles).toHaveLength(0)

      const noReservePlayer = makePlayerWithResources({ wood: 2 })
      noReservePlayer.stableTiles = fullStableTiles()
      const noReserveState = makeState(noReservePlayer)
      const noReserveOptions = PaymentSolver.computeOptions(noReserveState, 0, cost, cardCtx)
      expect(noReserveOptions).toEqual([])
    })

    it('requires stable reserve for optional returned-card supply-token cost', () => {
      const player = makePlayerWithResources({ clay: 0 })
      const state = makeState(player)
      const cardCtx: PaymentCtx = {
        ...ctx,
        playedCards: ['Major_Fireplace1'],
      }
      const cost = {
        fee: { clay: 4 },
        cards: {
          type: 'Major',
          list: ['Major_Fireplace1'],
          cost: { stable: 1 },
        },
      }

      const options = PaymentSolver.computeOptions(state, 0, cost, cardCtx)
      const cardOptionIndex = options.findIndex((option) => option.cardUsed === 'Major_Fireplace1')
      expect(cardOptionIndex).toBeGreaterThanOrEqual(0)
      expect(options[cardOptionIndex]?.resourcesPaid).toEqual({ stable: 1 })

      const result = PaymentSolver.resolvePayment(state, 0, cost, {
        ...cardCtx,
        optionPrefix: 'pay:test',
        paymentChoice: `pay:test:${cardOptionIndex}`,
      })
      expect(result.type).toBe('paid')
      expect(player.supplyTokensConsumed?.stable).toBe(1)
      expect(player.stableTiles).toHaveLength(0)

      const noReservePlayer = makePlayerWithResources({ clay: 0 })
      noReservePlayer.stableTiles = fullStableTiles()
      const noReserveState = makeState(noReservePlayer)
      const noReserveOptions = PaymentSolver.computeOptions(noReserveState, 0, cost, cardCtx)
      expect(noReserveOptions.some((option) => option.cardUsed === 'Major_Fireplace1')).toBe(false)
    })

    it('checks required returned-card stable cost against combined reserve', () => {
      const cardCtx: PaymentCtx = {
        ...ctx,
        playedCards: ['Major_Fireplace1'],
      }
      const cost = {
        fee: { stable: 1 },
        cards: {
          type: 'Major',
          list: ['Major_Fireplace1'],
          cost: { stable: 1 },
          required: true,
        },
      }

      const overReservePlayer = makePlayerWithResources({})
      setStableReserve(overReservePlayer, 1)
      expect(PaymentSolver.computeOptions(makeState(overReservePlayer), 0, cost, cardCtx)).toEqual([])

      const exactReservePlayer = makePlayerWithResources({})
      setStableReserve(exactReservePlayer, 2)
      const options = PaymentSolver.computeOptions(makeState(exactReservePlayer), 0, cost, cardCtx)
      expect(options).toHaveLength(1)
      expect(options[0]).toMatchObject({
        cardUsed: 'Major_Fireplace1',
        resourcesPaid: { stable: 2 },
      })
    })

    it('checks required returned-card fence cost against combined reserve', () => {
      const cardCtx: PaymentCtx = {
        ...ctx,
        playedCards: ['Major_Fireplace1'],
      }
      const cost = {
        fee: { fence: 1 },
        cards: {
          type: 'Major',
          list: ['Major_Fireplace1'],
          cost: { fence: 1 },
          required: true,
        },
      }

      const overReservePlayer = makePlayerWithResources({})
      setFenceReserve(overReservePlayer, 1)
      expect(PaymentSolver.computeOptions(makeState(overReservePlayer), 0, cost, cardCtx)).toEqual([])

      const exactReservePlayer = makePlayerWithResources({})
      setFenceReserve(exactReservePlayer, 2)
      const options = PaymentSolver.computeOptions(makeState(exactReservePlayer), 0, cost, cardCtx)
      expect(options).toHaveLength(1)
      expect(options[0]).toMatchObject({
        cardUsed: 'Major_Fireplace1',
        resourcesPaid: { fence: 2 },
      })
    })

  })

  describe('canAfford', () => {
    it('returns false when player cannot afford', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      expect(PaymentSolver.canAfford(state, 0, { wood: 3 }, ctx)).toBe(false)
    })

    it('returns true when player can afford', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      expect(PaymentSolver.canAfford(state, 0, { wood: 3 }, ctx)).toBe(true)
    })

    it('agrees with computeOptions for card-payment cost (D3 cache sharing)', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const ctxWithCards: PaymentCtx = {
        actionId: 'test-card-cost',
        costType: 'none',
        playedCards: ['some-card-id'],
      }
      const complexCost = { fee: { wood: 2 } }
      const optionCount = PaymentSolver.computeOptions(state, 0, complexCost, ctxWithCards).length
      const canAffordResult = PaymentSolver.canAfford(state, 0, complexCost, ctxWithCards)
      expect(canAffordResult).toBe(optionCount > 0)
    })
  })

  describe('resolvePayment execution', () => {
    it('returns paid with deducted state on valid choice', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const result = PaymentSolver.resolvePayment(state, 0, { wood: 3 }, ctx)
      expect(result.type).toBe('paid')
      expect(state.players[0].resources.wood).toBe(2)
    })

    it('returns failed reason:invalid-choice for out-of-range index', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const result = PaymentSolver.resolvePayment(state, 0, { wood: 3 }, {
        ...ctx,
        optionPrefix: 'pay:test',
        paymentChoice: 'pay:test:99',
      })
      expect(result.type).toBe('failed')
      if (result.type !== 'failed') return
      expect(result.reason).toBe('invalid-choice')
    })

    it('returns failed reason:cannot-afford when state can no longer pay', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      const result = PaymentSolver.resolvePayment(state, 0, { wood: 3 }, ctx)
      expect(result.type).toBe('failed')
      if (result.type !== 'failed') return
      expect(result.reason).toBe('cannot-afford')
    })
  })

  describe('clearCache', () => {
    it('exists and is callable', () => {
      expect(() => PaymentSolver.clearCache()).not.toThrow()
    })
  })

  describe('isComplexCost', () => {
    it('returns false for simple Partial<Resource>', () => {
      expect(PaymentSolver.isComplexCost({ wood: 3 })).toBe(false)
    })

    it('returns true for ComplexCost with fee', () => {
      expect(PaymentSolver.isComplexCost({ fee: { wood: 3 } })).toBe(true)
    })

    it('returns true for ComplexCost with cards', () => {
      expect(PaymentSolver.isComplexCost({ cards: { type: 'Major', list: ['K2'], required: true } })).toBe(true)
    })
  })

  describe('resolvePayment', () => {
    it('builds a payment choice and executes the selected option through the public lifecycle', () => {
      const player = makePlayerWithResources({ food: 2, grain: 1 })
      const state = makeState(player)
      const cost = { fees: [{ food: 2 }, { grain: 1 }] }
      const lifecycleCtx: PaymentCtx = {
        actionId: 'pay',
        costType: 'none',
        optionPrefix: 'pay:test',
      }

      const prompt = PaymentSolver.resolvePayment(state, 0, cost, lifecycleCtx)
      expect(prompt.type).toBe('request')
      if (prompt.type !== 'request') return
      expect(prompt.request.promptKey).toBe('prompt.selectPayment')
      expect(prompt.request.request.kind).toBe('choice')
      if (prompt.request.request.kind !== 'choice') return
      const grainOption = prompt.request.request.options.find((option) => {
        const paid = (
          (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
            ?.resourcesPaid ?? {}
        )
        return paid.grain === 1
      })
      expect(grainOption).toBeDefined()

      const paid = PaymentSolver.resolvePayment(state, 0, cost, {
        ...lifecycleCtx,
        paymentChoice: grainOption!.value,
      })
      expect(paid.type).toBe('paid')
      if (paid.type !== 'paid') return
      expect(player.resources.food).toBe(2)
      expect(player.resources.grain).toBe(0)
      expect(paid.receipt.resourcesPaid.grain).toBe(1)
    })

    it('returns candidate attribution for auto-resolved payments', () => {
      const player = makePlayerWithResources({ wood: 1 })
      const state = makeState(player)
      const paid = PaymentSolver.resolvePayment(
        state,
        0,
        { fees: [{ wood: 1 }] },
        {
          actionId: 'pay',
          costType: 'minor-improvement',
          candidateMetadataByFeeIndex: {
            0: {
              originalFeeIndex: 0,
              sources: ['A075_LumberMill'],
              costAttribution: {
                A075_LumberMill: { saved: { wood: 1 } },
              },
            },
          },
        },
      )

      expect(paid.type).toBe('paid')
      if (paid.type !== 'paid') return
      expect(paid.receipt.candidateSources).toEqual(['A075_LumberMill'])
      expect(paid.receipt.originalFeeIndex).toBe(0)
      expect(paid.receipt.costAttribution).toEqual({
        A075_LumberMill: { saved: { wood: 1 } },
      })
    })

    it('rejects invalid payment choices without mutating resources', () => {
      const player = makePlayerWithResources({ food: 2, grain: 1 })
      const state = makeState(player)
      const failed = PaymentSolver.resolvePayment(
        state,
        0,
        { fees: [{ food: 2 }, { grain: 1 }] },
        {
          actionId: 'pay',
          costType: 'none',
          optionPrefix: 'pay:test',
          paymentChoice: 'pay:test:99',
        },
      )

      expect(failed.type).toBe('failed')
      if (failed.type !== 'failed') return
      expect(failed.reason).toBe('invalid-choice')
      expect(player.resources.food).toBe(2)
      expect(player.resources.grain).toBe(1)
    })

    it('filters lifecycle options by reserved resources before auto-paying', () => {
      const player = makePlayerWithResources({ food: 3 })
      const state = makeState(player)
      const paid = PaymentSolver.resolvePayment(
        state,
        0,
        { fees: [{ food: 2 }, { food: 1 }] },
        {
          actionId: 'pay',
          costType: 'none',
          reserveResources: { food: 2 },
        },
      )

      expect(paid.type).toBe('paid')
      if (paid.type !== 'paid') return
      expect(paid.receipt.resourcesPaid).toEqual({ food: 1 })
      expect(player.resources.food).toBe(2)
    })

    it('filters lifecycle options that would exhaust a reserved resource pool', () => {
      const player = makePlayerWithResources({ wood: 2 })
      const state = makeState(player)
      const cost = {
        fee: { wood: 2 },
        resourceReserve: {
          resources: ['wood', 'clay', 'reed', 'stone'],
          minimum: 1,
        },
      } as const

      const failed = PaymentSolver.resolvePayment(state, 0, cost, {
        actionId: 'pay',
        costType: 'none',
      })

      expect(failed).toEqual({ type: 'failed', reason: 'cannot-afford' })
      expect(player.resources.wood).toBe(2)

      player.resources.clay = 1
      const paid = PaymentSolver.resolvePayment(state, 0, cost, {
        actionId: 'pay',
        costType: 'none',
      })

      expect(paid.type).toBe('paid')
      expect(player.resources).toMatchObject({ wood: 0, clay: 1 })
    })

    it('returns required returned-card provenance in the payment receipt', () => {
      const player = makePlayerWithResources({ clay: 2 })
      player.improvements = ['Major_ClayOven']
      const state = makeState(player)
      const paid = PaymentSolver.resolvePayment(
        state,
        0,
        {
          fee: { clay: 2 },
          cards: {
            type: 'Major',
            list: ['Major_ClayOven'],
            required: true,
          },
        },
        {
          actionId: 'pay',
          costType: 'none',
          playedCards: player.improvements,
          includeReturnedCard: true,
        },
      )

      expect(paid.type).toBe('paid')
      if (paid.type !== 'paid') return
      expect(paid.receipt.returnedCardId).toBe('Major_ClayOven')
      expect(paid.receipt.resourcesPaid).toEqual({ clay: 2 })
      expect(player.resources.clay).toBe(0)
    })

    it('executes card-provided payment resources and reports provider metadata', () => {
      const providerKey = 'B155_ArtTeacher:traveling-players-food'
      const player = makePlayerWithResources({ food: 1 })
      const state = {
        ...makeState(player),
        actionSpaces: [
          {
            id: 'traveling-players',
            resources: { food: 1 },
          },
        ],
      } as unknown as GameState
      const cost = {
        fee: { food: 1 },
        paymentResourceProviders: [
          {
            key: providerKey,
            sourceCard: 'B155_ArtTeacher',
            available: 1,
            covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
            consume: { type: 'actionSpace', spaceId: 'traveling-players', resource: 'food' },
          },
        ],
      }
      const prompt = PaymentSolver.resolvePayment(state, 0, cost, {
        actionId: 'pay',
        costType: 'occupation',
        optionPrefix: 'pay:provider',
      })
      expect(prompt.type).toBe('request')
      if (prompt.type !== 'request') return
      if (prompt.request.request.kind !== 'choice') return
      const providerOption = prompt.request.request.options.find((option) => {
        const paid = (
          (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)
            ?.resourcesPaid ?? {}
        )
        return paid[providerKey] === 1
      })
      expect(providerOption).toBeDefined()

      const paid = PaymentSolver.resolvePayment(state, 0, cost, {
        actionId: 'pay',
        costType: 'occupation',
        optionPrefix: 'pay:provider',
        paymentChoice: providerOption!.value,
      })

      expect(paid.type).toBe('paid')
      if (paid.type !== 'paid') return
      expect(player.resources.food).toBe(1)
      expect(state.actionSpaces[0]!.resources.food).toBe(0)
      expect(paid.receipt.resourcesPaid[providerKey]).toBe(1)
      expect(paid.receipt.paymentResourceProviders?.[0]?.sourceCard).toBe('B155_ArtTeacher')
    })
  })
})
