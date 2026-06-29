import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { playerBoard, Scoring } from '../../shared/domain'
import { countUnusedFarmyardSpaces, getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { addFarmyardExtension } from '../../shared/domain/farmyard-extensions'
import { getFarmyardTilePositions, isFarmyardBorderEdge, positionKey } from '../../shared/domain/farm'
import { getUnusedTerrainTiles } from '../../shared/moor/terrain-flow'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { M051_MoorEnclosures } from '../../shared/cards/M/M051_MoorEnclosures'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { FarmTilePosition, Resource } from '../../shared/contract/types'

const PLACEHOLDER = '__test_placeholder__'

const resources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 2,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
})

const setup = (cardId: string) => {
  const session = new GameSession(397, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  for (const player of state.players) {
    player.resources = resources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.farmTerrain = []
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    player.fenceSegments = []
    player.farmyardExtensions = []
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.minorHand = [cardId]
  if (cardId === 'M050_FarmExtension') {
    player.resources.clay = 1
  }
  if (cardId === 'M051_MoorEnclosures') {
    player.houseType = 'clay'
    player.resources.stone = 1
  }
  session.loadState(state)
  return session
}

const resolvePaymentIfNeeded = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
) => {
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.options?.[0]
    expect(option).toBeDefined()
    return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
  }
  return resp
}

const playMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvement = resp.interaction.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  expect(improvement).toBeDefined()
  resp = session.resolveChoice(0, improvement!.value)
  expect(resp.ok).toBe(true)
  resp = resolvePaymentIfNeeded(session, resp)
  if (resp.interaction.stateId === 'wait' && resp.interaction.selection?.kind === 'farm-position') {
    return resp
  }
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const card = resp.interaction.options?.find((option) => option.value === cardId)
  expect(card).toBeDefined()
  resp = session.resolveChoice(0, card!.value)
  expect(resp.ok).toBe(true)
  return resolvePaymentIfNeeded(session, resp)
}

const commitPositions = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
  tiles: FarmTilePosition[],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.selection?.kind).toBe('farm-position')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    positions: tiles,
  })
}

const emptyScore = (session: GameSession) =>
  Scoring.breakdown(session.state, 0).categories.find((category) => category.key === 'empty')?.total ?? 0

describe('M050/M051 farmyard extension', () => {
  it('M050 adds two real farmyard coordinates and dynamic helpers see them', () => {
    const session = setup('M050_FarmExtension')
    const resp = playMinor(session, 'M050_FarmExtension')
    const extension = [{ row: -1, col: 0 }, { row: -1, col: 1 }]

    const committed = commitPositions(session, resp, extension)
    expect(committed.ok).toBe(true)

    const player = committed.state.players[0]!
    expect(player.farmyardExtensions).toHaveLength(1)
    expect(player.farmyardExtensions?.[0]?.tiles).toEqual(extension)
    expect(getFarmyardTilePositions(player).map(positionKey)).toContain('-1-0')
    expect(countUnusedFarmyardSpaces(player)).toBe(15)
    expect(emptyScore(session)).toBe(-15)
    expect(getUnusedTerrainTiles(player).map(positionKey)).toContain('-1-0')
    expect(playerBoard(committed.state, 0).farmyard.canPlow({ row: -1, col: 0 }).ok).toBe(true)
    expect(isFarmyardBorderEdge(player, 'H--1-0')).toBe(true)
    expect(isFarmyardBorderEdge(player, 'H-0-0')).toBe(false)

    const fenceResult = playerBoard(committed.state, 0).farmyard.canBuildFence({
      edges: ['H--1-0', 'H--1-1', 'V--1-0', 'V--1-2', 'H-0-0', 'H-0-1'],
      options: { skipPayment: true },
    })
    expect(fenceResult.ok).toBe(true)
  })

  it('rejects invalid or overlapping extension coordinates and allows non-overlapping extensions', () => {
    const invalidSession = setup('M050_FarmExtension')
    const invalidResp = playMinor(invalidSession, 'M050_FarmExtension')
    const invalid = commitPositions(invalidSession, invalidResp, [
      { row: -1, col: 0 },
      { row: -1, col: 2 },
    ])
    expect(invalid.ok).toBe(false)
    expect(invalidSession.state.players[0]!.farmyardExtensions).toEqual([])

    const session = setup('M050_FarmExtension')
    const resp = playMinor(session, 'M050_FarmExtension')
    const committed = commitPositions(session, resp, [
      { row: -1, col: 0 },
      { row: -1, col: 1 },
    ])
    expect(committed.ok).toBe(true)
    const player = committed.state.players[0]!
    expect(addFarmyardExtension(player, 'test-overlap', [
      { row: -1, col: 0 },
      { row: -1, col: 1 },
    ])).toBe(false)
    expect(addFarmyardExtension(player, 'test-second', [
      { row: -1, col: 2 },
      { row: -1, col: 3 },
    ])).toBe(true)
    expect(player.farmyardExtensions).toHaveLength(2)
  })

  it('M051 adds the extension and places one moor on each new space', () => {
    const session = setup('M051_MoorEnclosures')
    const resp = playMinor(session, 'M051_MoorEnclosures')
    const extension = [{ row: -1, col: 0 }, { row: -1, col: 1 }]

    const committed = commitPositions(session, resp, extension)
    expect(committed.ok).toBe(true)

    const player = committed.state.players[0]!
    expect(player.farmyardExtensions).toHaveLength(1)
    expect(player.farmTerrain).toEqual([
      { row: -1, col: 0, kind: 'moor' },
      { row: -1, col: 1, kind: 'moor' },
    ])
    expect(Array.from(getUsedFarmyardTileKeys(player))).toEqual(
      expect.arrayContaining(['-1-0', '-1-1']),
    )
    expect(countUnusedFarmyardSpaces(player)).toBe(13)
  })

  it('M051 requires a clay house', () => {
    const session = setup('M051_MoorEnclosures')
    const player = session.state.players[0]!
    player.houseType = 'wood'
    session.loadState(session.state)

    expect(meetsCardPrerequisites(player, M051_MoorEnclosures, session.state.round, session.state)).toBe(false)
    player.houseType = 'stone'
    expect(meetsCardPrerequisites(player, M051_MoorEnclosures, session.state.round, session.state)).toBe(false)
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, M051_MoorEnclosures, session.state.round, session.state)).toBe(true)
  })
})
