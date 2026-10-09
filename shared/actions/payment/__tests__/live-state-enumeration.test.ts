import { beforeEach, describe, expect, it } from 'vitest'
import type { CardProvidedPaymentResourceProvider, ComplexCost, GameState, PaymentSolution, PlayerState } from '../../../contract/types'
import { createInitialState } from '../../../session/state-bootstrap'
import { PaymentSolver } from '..'

const freshState = (): GameState => {
  const state = createInitialState(42, { playerCount: 2 })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0 }
  }
  return state
}

const optionsFor = (state: GameState, player: PlayerState, cost: ComplexCost): PaymentSolution[] =>
  PaymentSolver.computeOptions(state, state.players.indexOf(player), cost, { actionId: 'test-payment', costType: 'none' })

const paid = (solution: PaymentSolution) =>
  Object.fromEntries(Object.entries(solution.resourcesPaid).filter(([, amount]) => (amount ?? 0) > 0))

const provider = (suffix: string): CardProvidedPaymentResourceProvider => ({
  key: `Test_Provider:${suffix}` as CardProvidedPaymentResourceProvider['key'],
  sourceCard: 'Test_Provider',
  available: 1,
  covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
  consume: { type: 'actionSpace', spaceId: 'clay-pit', resource: 'clay' },
})

const setClayPit = (state: GameState, clay: number) => {
  state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = clay
}

describe('payment enumeration follows live player state', () => {
  beforeEach(() => PaymentSolver.clearCache())

  it('does not reuse solutions between players with different room counts', () => {
    // Shape of C013-style renovation bonuses: no `nb`, so the player's rooms decide.
    const cost: ComplexCost = { fee: { stone: 4 }, bonuses: [{ discount: { stone: 2 }, conditions: { minNumRooms: 5 } }] }
    const fiveRooms = freshState()
    Object.assign(fiveRooms.players[0]!, { rooms: 5 })
    fiveRooms.players[0]!.resources.stone = 2
    const fourRooms = freshState()
    Object.assign(fourRooms.players[0]!, { rooms: 4 })
    fourRooms.players[0]!.resources.stone = 2

    expect(optionsFor(fiveRooms, fiveRooms.players[0]!, cost).map(paid)).toEqual([{ stone: 2 }])
    expect(optionsFor(fourRooms, fourRooms.players[0]!, cost)).toEqual([])
  })

  it('does not reuse solutions between players with different house types', () => {
    const cost: ComplexCost = { fee: { clay: 3 }, bonuses: [{ discount: { clay: 1 }, conditions: { houseTypeClay: 1 } }] }
    const state = freshState()
    const [clayHouse, woodHouse] = state.players as [PlayerState, PlayerState]
    clayHouse.houseType = 'clay'
    woodHouse.houseType = 'wood'
    clayHouse.resources.clay = 2
    woodHouse.resources.clay = 2

    expect(optionsFor(state, clayHouse, cost).map(paid)).toEqual([{ clay: 2 }])
    expect(optionsFor(state, woodHouse, cost)).toEqual([])
  })
})

describe('payment enumeration follows live provider backing', () => {
  beforeEach(() => PaymentSolver.clearCache())

  it('offers a provider payment only while its action space can back it', () => {
    const state = freshState()
    const player = state.players[0]!
    player.resources.food = 1
    const cost: ComplexCost = { fee: { food: 1 }, paymentResourceProviders: [provider('a')] }

    setClayPit(state, 1)
    expect(optionsFor(state, player, cost).map(paid)).toEqual(expect.arrayContaining([{ food: 1 }, { 'Test_Provider:a': 1 }]))

    setClayPit(state, 0)
    expect(optionsFor(state, player, cost).map(paid)).toEqual([{ food: 1 }])
  })

  it('adds the demand of provider keys that share one backing pool', () => {
    const state = freshState()
    const player = state.players[0]!
    const cost: ComplexCost = { fee: { food: 2 }, paymentResourceProviders: [provider('a'), provider('b')] }

    setClayPit(state, 1)
    expect(optionsFor(state, player, cost)).toEqual([])

    setClayPit(state, 2)
    expect(optionsFor(state, player, cost).map(paid)).toEqual([{ 'Test_Provider:a': 1, 'Test_Provider:b': 1 }])
  })
})
