import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import {
  getFenceCount,
  getPalisadeCount,
} from '../../shared/actions/effects/fencing'
import { getOwnOrdinaryFenceCount } from '../../shared/domain/fence-segments'
import type { FenceSegment, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/B/B30_WoodPalisades'
import '../../shared/cards/B/B94_StockProtector'
import '../../shared/cards/C/C1_Overhaul'
import '../../shared/cards/E/E108_BlackberryFarmer'

const CARD_ID = 'C1_Overhaul'
const B30_ID = 'B30_WoodPalisades'
const B94_ID = 'B94_StockProtector'
const E108_ID = 'E108_BlackberryFarmer'

const TILE_00 = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const TOP_ROW_15 = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-0-4',
  'H-1-0',
  'H-1-1',
  'H-1-2',
  'H-1-3',
  'H-1-4',
  'V-0-1',
  'V-0-2',
  'V-0-3',
  'V-0-4',
  'V-0-5',
  'H-2-2',
]
const TOP_ROW_16 = [...TOP_ROW_15, 'H-2-3']

type SetupOptions = {
  wood?: number
  ownFenceEdges?: string[]
  ownFenceCount?: number
  consumedFences?: number
  palisadeEdges?: string[]
  borrowedFenceEdges?: string[]
  withB30?: boolean
  animals?: boolean
  playedOccupations?: string[]
}

const clone = <T>(value: T): T => structuredClone(value)

const ownFence = (player: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'own', ownerPlayerId: player.id },
})

const ownPalisade = (player: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'palisade',
  source: { kind: 'own', ownerPlayerId: player.id },
})

const borrowedFence = (owner: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'borrowed', ownerPlayerId: owner.id },
})

const setup = (opts: SetupOptions = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  const next = state.players[1]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: opts.wood ?? 1,
    food: 5,
  }
  player.minorHand = [CARD_ID]
  next.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  next.occupationHand = ['__test_placeholder__']
  player.occupationPlayed = ['__test_occ_a__', '__test_occ_b__', ...(opts.playedOccupations ?? [])]
  next.occupationPlayed = []
  player.minorPlayed = opts.withB30 ? [B30_ID] : []

  const generatedOwnEdges = Array.from(
    { length: opts.ownFenceCount ?? 0 },
    (_, i) => `__c1_own_${i}`,
  )
  player.fenceSegments = [
    ...(opts.ownFenceEdges ?? []).map((edge) => ownFence(player, edge)),
    ...generatedOwnEdges.map((edge) => ownFence(player, edge)),
    ...(opts.palisadeEdges ?? []).map((edge) => ownPalisade(player, edge)),
    ...(opts.borrowedFenceEdges ?? []).map((edge) => borrowedFence(next, edge)),
  ]
  player.supplyTokensConsumed = opts.consumedFences ? { fence: opts.consumedFences } : {}

  if (opts.animals) {
    player.resources.sheep = 2
    player.pastures = [
      {
        id: 'pasture-1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]
  }

  session.loadState(state)
  return session
}

const buyC1 = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  if (resp.interaction.sourceCard === CARD_ID) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.options?.find((option) => option.value === `minor:${CARD_ID}`)
  if (!cardOption) return resp
  resp = session.resolveChoice(0, cardOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const cloneInteraction = (resp: SessionResponse) => clone(resp.interaction)

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
  expect(resp.interaction.options).toEqual([
    { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
  ])
  expect(resp.interaction.farm?.farmType).toBe('fence')
  if (expected) {
    expect(resp.interaction).toEqual(expected)
  }
}

const snapshotAfterRaze = (state: GameState) => {
  const player = state.players[0]!
  return {
    fenceSegments: clone(player.fenceSegments),
    resources: clone(player.resources),
    cardStates: clone(player.cardStates),
    pastures: clone(player.pastures),
    events: clone(state.events),
    log: clone(state.log),
  }
}

const expectSnapshotUnchanged = (
  state: GameState,
  before: ReturnType<typeof snapshotAfterRaze>,
) => {
  const player = state.players[0]!
  expect(player.fenceSegments).toEqual(before.fenceSegments)
  expect(player.resources).toEqual(before.resources)
  expect(player.cardStates).toEqual(before.cardStates)
  expect(player.pastures).toEqual(before.pastures)
  expect(state.events).toEqual(before.events)
  expect(state.log).toEqual(before.log)
}

describe('C1 Overhaul session', () => {
  it('passes C1 away but rebuilds for the buyer for free after C1 cost is paid', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00 })
    const resp = buyC1(session)
    expectFarmSelect(resp)

    const afterBuy = resp.state.players[0]!
    expect(afterBuy.resources.wood).toBe(0)
    expect(afterBuy.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(getOwnOrdinaryFenceCount(afterBuy)).toBe(0)

    const rebuild = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(rebuild.ok).toBe(true)
    const buyer = rebuild.state.players[0]!
    expect(buyer.resources.wood).toBe(0)
    expect(getOwnOrdinaryFenceCount(buyer)).toBe(4)
    expect(buyer.pastures).toHaveLength(1)
    expect(buyer.minorPlayed).not.toContain(CARD_ID)
  })

  it('counts C1 rebuild as building fences for E108 Blackberry Farmer', () => {
    const session = setup({
      wood: 1,
      ownFenceEdges: TILE_00,
      playedOccupations: [E108_ID],
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)

    const resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const playerId = resp.state.players[0]!.id
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        actorPlayerId: playerId,
        newFenceEdges: TILE_00,
      }),
      expect.objectContaining({
        type: 'futureMeeple.queued',
        sourceCardId: E108_ID,
      }),
    ]))
    const futureForCard = resp.state.futureMeeples.filter(
      (entry) => entry.cardId === E108_ID && entry.playerId === playerId,
    )
    expect(futureForCard).toHaveLength(TILE_00.length)
    expect(futureForCard.map((entry) => entry.round).sort((a, b) => a - b)).toEqual([2, 3, 4, 5])
    futureForCard.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('does not treat C1 rebuild as using the Fencing action space for B94 Stock Protector', () => {
    const session = setup({
      wood: 1,
      ownFenceEdges: TILE_00,
      playedOccupations: [B94_ID],
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)

    const resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionStockProtectorPlace')
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.gained',
        sourceCardId: B94_ID,
      }),
    ]))
  })

  it('does not start rebuild at n=0 and leaves palisades on board', () => {
    const session = setup({ wood: 1, palisadeEdges: ['H-0-0', 'V-0-0'] })
    const resp = buyC1(session)

    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).not.toBe('farm-select')
    }
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(getOwnOrdinaryFenceCount(player)).toBe(0)
    expect(getPalisadeCount(player)).toBe(2)
  })

  it('returns only own ordinary fences, not palisades or borrowed fences', () => {
    const session = setup({
      wood: 1,
      ownFenceCount: 2,
      palisadeEdges: ['H-0-0'],
      borrowedFenceEdges: ['V-0-0'],
    })
    const resp = buyC1(session)
    expectFarmSelect(resp)

    const player = resp.state.players[0]!
    expect(getOwnOrdinaryFenceCount(player)).toBe(0)
    expect(getFenceCount(player)).toBe(1)
    expect(getPalisadeCount(player)).toBe(1)
    expect(player.fenceSegments).toEqual([
      ownPalisade(player, 'H-0-0'),
      borrowedFence(resp.state.players[1]!, 'V-0-0'),
    ])
  })

  it('rejects cancel after raze and keeps pending state unchanged', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const cancel = session.commitSelectionChoice(0, { cancel: true })
    expect(cancel.ok).toBe(false)
    expect(cancel.error).toBe('action cancel is not allowed')
    expectFarmSelect(cancel, beforeInteraction)
    expectSnapshotUnchanged(cancel.state, before)
  })

  it('rejects rebuilding fewer than n fences and keeps pending state unchanged', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('TOO_FEW_FENCES')
    expectFarmSelect(resp, beforeInteraction)
    expectSnapshotUnchanged(resp.state, before)
  })

  it('rejects rebuilding more than effectiveMax and keeps pending state unchanged', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-0-1', 'H-0-2', 'H-0-3', 'H-1-0', 'H-1-1', 'H-1-2', 'H-1-3'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('TOO_MANY_FENCES')
    expectFarmSelect(resp, beforeInteraction)
    expectSnapshotUnchanged(resp.state, before)
  })

  it('caps n greater than 12 at own ordinary supply after return and ignores borrowed or palisade supply', () => {
    const session = setup({
      wood: 1,
      ownFenceCount: 13,
      palisadeEdges: ['H-0-0'],
      borrowedFenceEdges: ['V-0-0'],
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const tooMany = session.commitSelectionChoice(0, {
      edges: TOP_ROW_16,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(tooMany.ok).toBe(false)
    expect(tooMany.error).toBe('TOO_MANY_FENCES')
    expectFarmSelect(tooMany, beforeInteraction)
    expectSnapshotUnchanged(tooMany.state, before)

    const maxOk = session.commitSelectionChoice(0, {
      edges: TOP_ROW_15,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(maxOk.ok).toBe(true)
    const player = maxOk.state.players[0]!
    expect(getOwnOrdinaryFenceCount(player)).toBe(15)
    expect(getFenceCount(player)).toBe(16)
    expect(getPalisadeCount(player)).toBe(1)
    expect(player.resources.wood).toBe(0)
  })

  it('caps rebuild at dynamic own ordinary build limit after consumed fence supply', () => {
    const session = setup({
      wood: 1,
      ownFenceCount: 13,
      consumedFences: 1,
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const tooMany = session.commitSelectionChoice(0, {
      edges: TOP_ROW_15,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(tooMany.ok).toBe(false)
    expect(tooMany.error).toBe('TOO_MANY_FENCES')
    expectFarmSelect(tooMany, beforeInteraction)
    expectSnapshotUnchanged(tooMany.state, before)

    const maxOk = session.commitSelectionChoice(0, {
      edges: TOP_ROW_15.slice(0, 14),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(maxOk.ok).toBe(true)
    expect(getOwnOrdinaryFenceCount(maxOk.state.players[0]!)).toBe(14)
  })

  it('rejects B30 palisade input during C1 rebuild and keeps pending state unchanged', () => {
    const session = setup({
      wood: 1,
      ownFenceEdges: TILE_00,
      withB30: true,
      animals: true,
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('SEGMENT_TYPE_NOT_ALLOWED')
    expectFarmSelect(resp, beforeInteraction)
    expectSnapshotUnchanged(resp.state, before)
  })

  it('does not lose animals on successful rebuild', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    buyC1(session)

    const resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(2)
    expect(player.pastures).toEqual([
      {
        id: 'pasture-1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
    ])
  })
})
