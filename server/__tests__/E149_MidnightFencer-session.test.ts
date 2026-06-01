import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getOwnOrdinaryFenceCount } from '../../shared/domain/fence-segments'
import {
  getOwnOrdinaryFenceBuildLimit,
  getOwnOrdinaryFenceReserveCount,
} from '../../shared/domain/supply-tokens'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { ActionChoiceOption, FenceSegment, PlayerState, SessionResponse } from '../../shared/contract/types'

import '../../shared/cards/register-all'
import '../../shared/cards/B/B30_WoodPalisades'

const CARD_ID = 'E149_MidnightFencer'
const B30_ID = 'B30_WoodPalisades'
const TILE_00 = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const WIDE_PASTURE_EDGES = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-0-4',
  'H-3-1',
  'H-3-2',
  'H-3-3',
  'H-3-4',
  'V-0-1',
  'V-1-1',
  'V-2-1',
  'V-0-5',
  'V-1-5',
  'V-2-5',
]

const ownFence = (player: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'own', ownerPlayerId: player.id },
})

const setupHarvest = (options: {
  withCard?: boolean
  withB30?: boolean
  donorConsumed?: number[]
  ownerFenceEdges?: string[]
} = {}) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.round = 14
  state.currentPlayerIndex = 0
  state.players.forEach((player, index) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    player.resources.wood = 0
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.fenceSegments = []
    player.supplyTokensConsumed = {}
    setActiveWorkerCount(player, 1)
    markAllWorkersUsed(state, player)
    const consumed = options.donorConsumed?.[index]
    if (consumed !== undefined) {
      player.supplyTokensConsumed.fence = consumed
    }
  })
  const owner = state.players[0]!
  if (options.withCard !== false) {
    owner.occupationPlayed.push(CARD_ID)
  }
  if (options.withB30) {
    owner.minorPlayed.push(B30_ID)
  }
  owner.fenceSegments = (options.ownerFenceEdges ?? []).map((edge) => ownFence(owner, edge))
  session.loadState(state)
  return session
}

const expectWait = (resp: SessionResponse) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait interaction')
  return resp.interaction
}

const acceptOptional = (session: GameSession, resp: SessionResponse) => {
  const interaction = expectWait(resp)
  const accept = interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(interaction.playerIndex, accept!.value)
}

const skipOptional = (session: GameSession, resp: SessionResponse) => {
  const interaction = expectWait(resp)
  const skip = interaction.options?.find((option: ActionChoiceOption) => option.value === '__skip__')
  expect(skip).toBeDefined()
  return session.resolveChoice(interaction.playerIndex, skip!.value)
}

const buildTile00 = (session: GameSession, sources: Record<string, string>) =>
  session.commitSelectionChoice(0, {
    edges: TILE_00,
    palisadeEdges: [],
    extraWood: 0,
    fenceSources: sources,
  })

describe('E149 Midnight Fencer', () => {
  it('round 13 card hook does not offer borrowed fencing', () => {
    const session = setupHarvest()
    const state = session.getState().state
    state.round = 13

    const flow = getCardEffect(CARD_ID)?.onStartHarvest?.(state, state.players[0]!)

    expect(flow).toBeUndefined()
  })

  it('round 14 4-player accept builds real borrowed fences and consumes donor reserves', () => {
    const session = setupHarvest({ donorConsumed: [0, 0, 13, 15] })

    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)
    const interaction = expectWait(resp)
    expect(interaction.request.kind).toBe('farm-select')
    if (interaction.request.kind !== 'farm-select') return
    expect(interaction.request.farm).toMatchObject({
      farmType: 'fence',
      fenceSource: { kind: 'borrowed', donorCaps: { p2: 2, p3: 2, p4: 0 } },
    })

    resp = buildTile00(session, {
      'H-0-0': 'p2',
      'H-1-0': 'p2',
      'V-0-0': 'p3',
      'V-0-1': 'p3',
    })

    expect(resp.ok).toBe(true)
    const owner = resp.state.players[0]!
    expect(owner.fenceSegments).toEqual(
      TILE_00.map((edge) => ({
        edge,
        type: 'fence',
        source: { kind: 'borrowed', ownerPlayerId: edge.startsWith('H-') ? 'p2' : 'p3' },
      })),
    )
    expect(owner.pastures).toHaveLength(1)
    expect(owner.cardStates?.[CARD_ID]?.extraData?.offered).toBe(true)
    expect(owner.cardStates?.[CARD_ID]?.extraData?.owedFences).toBeUndefined()
    expect(getCardEffect(CARD_ID)?.computeBonusScore).toBeUndefined()
    expect(resp.state.players[1]!.supplyTokensConsumed?.fence).toBe(2)
    expect(resp.state.players[2]!.supplyTokensConsumed?.fence).toBe(15)
    expect(getOwnOrdinaryFenceReserveCount(resp.state.players[1]!)).toBe(13)
    expect(getOwnOrdinaryFenceBuildLimit(resp.state.players[1]!)).toBe(13)
  })

  it('skip marks the harvest offer and does not create owed fences', () => {
    const session = setupHarvest({ donorConsumed: [0, 0, 13, 15] })

    let resp = session.performRoundEnd()
    resp = skipOptional(session, resp)

    const owner = resp.state.players[0]!
    expect(owner.cardStates?.[CARD_ID]?.extraData?.offered).toBe(true)
    expect(owner.cardStates?.[CARD_ID]?.extraData?.owedFences).toBeUndefined()
    expect(owner.fenceSegments).toHaveLength(0)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe(CARD_ID)
  })

  it('does not write offered when the card is unplayed, donor caps are zero, or no legal commit exists', () => {
    const unplayed = setupHarvest({ withCard: false, donorConsumed: [0, 0, 13, 15] }).performRoundEnd()
    expect(unplayed.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.offered).toBeUndefined()

    const zeroCaps = setupHarvest({ donorConsumed: [0, 15, 15, 15] }).performRoundEnd()
    expect(zeroCaps.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.offered).toBeUndefined()

    const noLegalCommit = setupHarvest({ donorConsumed: [0, 13, 15, 15] }).performRoundEnd()
    expect(noLegalCommit.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.offered).toBeUndefined()
  })

  it('enforces donor caps and forbids B30 palisades in the borrowed fence action', () => {
    const session = setupHarvest({ withB30: true, donorConsumed: [0, 0, 13, 15] })
    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)

    const overCap = buildTile00(session, {
      'H-0-0': 'p2',
      'H-1-0': 'p2',
      'V-0-0': 'p2',
      'V-0-1': 'p2',
    })
    expect(overCap.ok).toBe(false)
    expect(overCap.error).toBe('BORROWED_FENCE_DONOR_LIMIT_EXCEEDED')

    const palisade = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
      fenceSources: { 'H-1-0': 'p2', 'V-0-1': 'p2' },
    })
    expect(palisade.ok).toBe(false)
    expect(palisade.error).toBe('SEGMENT_TYPE_NOT_ALLOWED')
  })

  it('lets an owner with 15 own fences build borrowed fences beyond the own limit', () => {
    const ownerFenceEdges = [...WIDE_PASTURE_EDGES, 'H-0-0']
    const session = setupHarvest({
      donorConsumed: [0, 0, 15, 15],
      ownerFenceEdges,
    })

    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)
    resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
      fenceSources: { 'H-1-0': 'p2', 'V-0-0': 'p2' },
    })

    expect(resp.ok).toBe(true)
    const owner = resp.state.players[0]!
    expect(getOwnOrdinaryFenceCount(owner)).toBe(15)
    expect(owner.fenceSegments).toHaveLength(17)
    expect(resp.state.players[1]!.supplyTokensConsumed?.fence).toBe(2)
  })
})
