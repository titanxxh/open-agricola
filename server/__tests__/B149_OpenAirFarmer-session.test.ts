import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stablesAction } from '../../shared/actions/effects/stables'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import type {
  ActionExecutionContext,
  ActionSpace,
  FenceSegment,
  GameState,
  PlayerState,
  Resource,
} from '../../shared/contract/types'

import '../../shared/cards/B/B149_OpenAirFarmer'

const CARD_ID = 'B149_OpenAirFarmer'

const TWO_CELL = [
  'H-0-1',
  'H-0-2',
  'H-1-1',
  'H-1-2',
  'V-0-1',
  'V-0-3',
]

const ONE_CELL = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const THREE_CELL = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-1-1',
  'H-1-2',
  'H-1-3',
  'V-0-1',
  'V-0-4',
]

const TWO_SINGLE_PASTURES = [
  'H-0-1',
  'H-1-1',
  'V-0-1',
  'V-0-2',
  'H-0-3',
  'H-1-3',
  'V-0-3',
  'V-0-4',
]

const LOWER_TWO_CELL_FROM_EXISTING = [
  'H-2-1',
  'H-2-2',
  'V-1-1',
  'V-1-3',
]

const MODIFY_EXISTING_AND_CREATE_TWO = [
  'V-0-2',
  ...LOWER_TWO_CELL_FROM_EXISTING,
]

const stableSpace = {
  id: 'farm-expansion',
  type: 'farm-expansion',
} as unknown as ActionSpace

type SetupOptions = {
  wood?: number
  existingPasture?: boolean
}

const ownFence = (player: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'own', ownerPlayerId: player.id },
})

const setup = (options: SetupOptions = {}) => {
  const session = new GameSession(1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  const next = state.players[1]!
  setWorkersAtHome(state, player, 2)
  setWorkersAtHome(state, next, 2)
  player.resources = {
    ...player.resources,
    wood: options.wood ?? 2,
    food: 0,
  }
  player.rooms = 2
  player.roomTiles = [
    { row: 2, col: 0 },
    { row: 2, col: 1 },
  ]
  player.occupationHand = [CARD_ID]
  player.occupationPlayed = []
  player.minorHand = ['__test_placeholder__']
  next.occupationHand = ['__test_placeholder__']
  next.minorHand = ['__test_placeholder__']

  if (options.existingPasture) {
    player.fenceSegments = TWO_CELL.map((edge) => ownFence(player, edge))
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
  }

  session.loadState(state)
  return session
}

const clone = <T>(value: T): T => structuredClone(value)

const expectFarmSelect = (
  resp: SessionResponse,
  expected?: SessionResponse['interaction'],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return
  expect(resp.interaction.playerIndex).toBe(0)
  expect(resp.interaction.sourceCard).toBe(CARD_ID)
  expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')
  expect(resp.interaction.request.kind).toBe('farm-select')
  expect(resp.interaction.farm?.farmType).toBe('fence')
  if (expected) {
    expect(resp.interaction).toEqual(expected)
  }
}

const playB149ToFencing = (session: GameSession) => {
  let resp = session.takeAction(0, 'lessons')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait') {
    const option = resp.interaction.options?.find((entry) => entry.value === CARD_ID)
    if (option) {
      resp = session.resolveChoice(0, option.value)
    }
  }
  expect(resp.ok).toBe(true)
  expectFarmSelect(resp)
  return resp
}

const snapshotPending = (state: GameState) => {
  const player = state.players[0]!
  return {
    resources: clone(player.resources),
    supplyTokensConsumed: clone(player.supplyTokensConsumed),
    fenceSegments: clone(player.fenceSegments),
    pastures: clone(player.pastures),
    occupationPlayed: clone(player.occupationPlayed),
    events: clone(state.events),
    log: clone(state.log),
  }
}

const expectPendingSnapshot = (
  state: GameState,
  before: ReturnType<typeof snapshotPending>,
) => {
  const player = state.players[0]!
  expect(player.resources).toEqual(before.resources)
  expect(player.supplyTokensConsumed).toEqual(before.supplyTokensConsumed)
  expect(player.fenceSegments).toEqual(before.fenceSegments)
  expect(player.pastures).toEqual(before.pastures)
  expect(player.occupationPlayed).toEqual(before.occupationPlayed)
  expect(state.events).toEqual(before.events)
  expect(state.log).toEqual(before.log)
}

const fencingPayments = (state: GameState) =>
  state.events.filter((event) => {
    const payment = event as { type?: string; paymentFor?: string; resources?: Partial<Resource> }
    return payment.type === 'resource.paid' && payment.paymentFor === 'fencing'
  })

const paidWoodEvents = (state: GameState) =>
  state.events.filter((event) => {
    const payment = event as { type?: string; resources?: Partial<Resource> }
    return payment.type === 'resource.paid' && (payment.resources?.wood ?? 0) > 0
  })

describe('B149 Open Air Farmer session', () => {
  it('playing B149 consumes three stable supply tokens but no wood before fencing', () => {
    const session = setup({ wood: 2 })
    const resp = playB149ToFencing(session)
    const player = resp.state.players[0]!

    expect(player.occupationPlayed).toContain(CARD_ID)
    expect(player.supplyTokensConsumed?.stable).toBe(3)
    expect(player.stableTiles).toHaveLength(0)
    expect(player.resources.wood).toBe(2)
    expect(paidWoodEvents(resp.state)).toHaveLength(0)
  })

  it('valid fencing pays exactly two wood once and builds one size-two pasture', () => {
    const session = setup({ wood: 2 })
    playB149ToFencing(session)

    const resp = session.resolveChoice(0, 'confirm', {
      edges: TWO_CELL,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.supplyTokensConsumed?.stable).toBe(3)
    expect(player.fenceSegments).toHaveLength(6)
    expect(player.pastures).toHaveLength(1)
    expect(player.pastures[0]?.size).toBe(2)
    expect(fencingPayments(resp.state)).toEqual([
      expect.objectContaining({
        resources: { wood: 2 },
      }),
    ])
  })

  it('invalid fencing does not consume fixed wood and the pending can still complete once', () => {
    const session = setup({ wood: 2 })
    const pending = playB149ToFencing(session)
    const beforeInteraction = clone(pending.interaction)
    const before = snapshotPending(session.getState().state)

    const invalid = session.resolveChoice(0, 'confirm', {
      edges: ONE_CELL,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(invalid.ok).toBe(false)
    expectFarmSelect(invalid, beforeInteraction)
    expectPendingSnapshot(invalid.state, before)

    const valid = session.resolveChoice(0, 'confirm', {
      edges: TWO_CELL,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(valid.ok).toBe(true)
    expect(valid.state.players[0]!.resources.wood).toBe(0)
    expect(fencingPayments(valid.state)).toHaveLength(1)
  })

  it('cancel does not consume fixed wood or complete the onBuy fencing sequence', () => {
    const session = setup({ wood: 2 })
    const pending = playB149ToFencing(session)
    const beforeInteraction = clone(pending.interaction)
    const before = snapshotPending(session.getState().state)

    const cancel = session.resolveChoice(0, 'cancel')

    expect(cancel.ok).toBe(false)
    expect(cancel.error).toBe('log.fencingFail')
    expectFarmSelect(cancel, beforeInteraction)
    expectPendingSnapshot(cancel.state, before)
  })

  it.each([
    ['size-one pasture', ONE_CELL],
    ['size-three pasture', THREE_CELL],
    ['multiple new pastures', TWO_SINGLE_PASTURES],
  ])('%s fails recoverably without consuming fixed wood', (_name, edges) => {
    const session = setup({ wood: 2 })
    const pending = playB149ToFencing(session)
    const beforeInteraction = clone(pending.interaction)
    const before = snapshotPending(session.getState().state)

    const resp = session.resolveChoice(0, 'confirm', {
      edges,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
    expectFarmSelect(resp, beforeInteraction)
    expectPendingSnapshot(resp.state, before)
  })

  it('modifying an existing pasture while creating one new pasture fails recoverably', () => {
    const session = setup({ wood: 2, existingPasture: true })
    const pending = playB149ToFencing(session)
    const beforeInteraction = clone(pending.interaction)
    const before = snapshotPending(session.getState().state)

    const resp = session.resolveChoice(0, 'confirm', {
      edges: MODIFY_EXISTING_AND_CREATE_TWO,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
    expectFarmSelect(resp, beforeInteraction)
    expectPendingSnapshot(resp.state, before)
  })

  it('after B149 only one normal stable remains buildable', () => {
    const session = setup({ wood: 4 })
    playB149ToFencing(session)
    const resp = session.resolveChoice(0, 'confirm', {
      edges: TWO_CELL,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const state = resp.state
    const player = state.players[0]!
    expect(getAvailableStableSupplyCount(state, player)).toBe(1)

    const stableResult = stablesAction.execute({
      state,
      player,
      space: stableSpace,
    } as ActionExecutionContext)

    expect(stableResult.type).toBe('request')
    if (stableResult.type !== 'request') return
    expect(stableResult.request.kind).toBe('farm-select')
    if (stableResult.request.kind !== 'farm-select') return
    expect(stableResult.request.farm.maxSelections).toBe(1)
  })
})
