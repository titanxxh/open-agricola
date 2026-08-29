import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, ComplexCost, GameState, PlayerState } from '../../shared/contract/types'
import { registerCustomCard } from '../../shared/cards/custom-registry'
import {
  getMinorImprovementPreviewCostDetailed,
  getPrintedImprovementCostCandidates,
} from '../../shared/actions/helpers/improvement-helpers'
import { PaymentSolver } from '../../shared/actions/payment'

import '../../shared/cards/B/B036_Bottles'
import '../../shared/cards/D/D080_BrickHammer'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/E/E054_Contraband'
import '../../shared/cards/E/E146_Reseller'
import '../../shared/cards/E/E156_ClaypitOwner'

registerCustomCard({
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_D080_NoSummedClay',
    name: 'D80 No Summed Clay',
    deck: 'community',
    number: 1,
    desc: [],
    cost: { clay: 1 },
    altCosts: [{ clay: 1 }, { wood: 2 }],
  },
}, { allowGlobal: true })

const makePlayer = (id: string): PlayerState => ({
  id,
  name: id,
  color: id === 'p1' ? 'red' : 'blue',
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
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  fences: 0,
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
  activeModifiers: [],
  cardStates: {},
} as PlayerState)

const makeState = (players: PlayerState[]): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players,
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as GameState)

const makePlayerWithWorkers = (id: string, count: number): PlayerState => {
  const player = makePlayer(id)
  player.workers = Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    isActive: true,
    isNewborn: false,
  }))
  return player
}

const space = { id: 'improvement' } as ActionSpace

const findListener = (id: string) => {
  const listener = getRegisteredCardListeners().find((entry) => entry.id === id)
  expect(listener, `listener not registered: ${id}`).toBeDefined()
  return listener!
}

const runAfterImprovement = (
  listenerId: string,
  builtCardId: string,
  player: PlayerState,
  state: GameState,
) => executeCardListener(findListener(listenerId), {
  state,
  player,
  space,
  actionId: 'improvement',
  phase: 'after',
  choice: `minor:${builtCardId}`,
  result: { type: 'ok' },
} as CardListenerContext)

const runAfterPay = (
  builtCardId: string,
  costType: 'major-improvement' | 'minor-improvement',
  player: PlayerState,
  state: GameState,
) => executeCardListener(findListener('E54-contraband-after-pay'), {
  state,
  player,
  space,
  actionId: 'pay',
  phase: 'after',
  sourceCard: builtCardId,
  costType,
} as CardListenerContext)

const runImmediatelyAfterImprovement = (
  builtCardId: string,
  kind: 'major' | 'minor',
  player: PlayerState,
  state: GameState,
) => executeCardListener(findListener('E146-reseller-immediately-after-improvement'), {
  state,
  player,
  space,
  actionId: 'improvement',
  phase: 'immediatelyAfter',
  choice: `${kind}:${builtCardId}`,
} as CardListenerContext)

describe('printed improvement cost listeners', () => {
  it('reads dynamic and alternative printed cost candidates without combining them', () => {
    const player = makePlayerWithWorkers('p1', 3)
    const state = makeState([player])

    expect(getPrintedImprovementCostCandidates(state, player, 'B036_Bottles')).toEqual([
      { clay: 3, food: 3 },
    ])
    expect(getPrintedImprovementCostCandidates(state, player, 'E030_ChildsToy')).toEqual([
      { wood: 1 },
      { clay: 1 },
    ])
  })

  it('E54 and E146 use Bottles dynamic printed cost', () => {
    const player = makePlayerWithWorkers('p1', 3)
    const state = makeState([player])

    expect(runAfterPay('B036_Bottles', 'minor-improvement', player, state)?.flow).toMatchObject({
      type: 'xor',
      optional: true,
      children: [{
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { clay: 1 } },
          { type: 'leaf', actionId: 'gain', params: { food: 3 } },
        ],
      }],
    })
    expect(runImmediatelyAfterImprovement('B036_Bottles', 'minor', player, state)?.flow).toMatchObject({
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-flag', flag: true } },
        { type: 'leaf', actionId: 'gain', params: { clay: 3, food: 3 } },
      ],
    })
  })

  it('E156 detects Bottles dynamic clay cost for the triggering player', () => {
    const trigger = makePlayerWithWorkers('p1', 3)
    const owner = makePlayer('p2')
    owner.occupationPlayed = ['E156_ClaypitOwner']

    expect(runAfterImprovement(
      'E156-claypit-owner-opponent-improvement-clay',
      'B036_Bottles',
      trigger,
      makeState([trigger, owner]),
    )?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: 'E156_ClaypitOwner',
      params: { food: 1, clay: 1 },
    })
  })

  it('E54 and E146 read major improvement printed costs', () => {
    const player = makePlayer('p1')
    const state = makeState([player])

    expect(runAfterPay('Major_Fireplace1', 'major-improvement', player, state)?.flow).toMatchObject({
      type: 'xor',
      children: [{
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { clay: 1 } },
          { type: 'leaf', actionId: 'gain', params: { food: 3 } },
        ],
      }],
    })
    expect(runImmediatelyAfterImprovement('Major_Fireplace1', 'major', player, state)?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-flag', flag: true } },
        { type: 'leaf', actionId: 'gain', params: { clay: 2 } },
      ],
    })
  })

  it('D80 ignores its own non-clay altCosts when checking printed clay cost', () => {
    const player = makePlayer('p1')
    player.minorPlayed = ['D080_BrickHammer']
    const result = runAfterImprovement(
      'D80-brick-hammer-after-improvement',
      'D080_BrickHammer',
      player,
      makeState([player]),
    )

    expect(result).toBeUndefined()
  })

  it('D80 does not add clay from cost and altCosts together', () => {
    const player = makePlayer('p1')
    player.minorPlayed = ['D080_BrickHammer']
    const result = runAfterImprovement(
      'D80-brick-hammer-after-improvement',
      'CUSTOM_D080_NoSummedClay',
      player,
      makeState([player]),
    )

    expect(result).toBeUndefined()
  })

  it('E156 detects clay in minor altCosts', () => {
    const trigger = makePlayer('p1')
    const owner = makePlayer('p2')
    owner.occupationPlayed = ['E156_ClaypitOwner']
    const result = runAfterImprovement(
      'E156-claypit-owner-opponent-improvement-clay',
      'E030_ChildsToy',
      trigger,
      makeState([trigger, owner]),
    )

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: 'E156_ClaypitOwner',
      params: { food: 1, clay: 1 },
    })
  })

  it('D117 discounts improvements with wood only in minor altCosts', () => {
    const player = makePlayer('p1')
    player.occupationPlayed = ['D117_WoodExpert']
    const result = getMinorImprovementPreviewCostDetailed(
      makeState([player]),
      player,
      'E030_ChildsToy',
    )

    expect(PaymentSolver.isComplexCost(result?.cost)).toBe(true)
    const fees = (result?.cost as ComplexCost).fees ?? []
    const rows = fees.map((resources, index) => ({
      resources,
      sources: result?.candidateMetadataByFeeIndex?.[index]?.sources ?? [],
    }))
    const key = (row: unknown) => JSON.stringify(row)
    expect([...rows].map(key).sort()).toEqual([
      { resources: { wood: 1 }, sources: [] },
      { resources: { clay: 1 }, sources: [] },
      { resources: { food: 1 }, sources: ['D117_WoodExpert'] },
    ].map(key).sort())
  })
})
