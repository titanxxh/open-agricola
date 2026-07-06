import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { createInitialState } from '../../shared/session/state-bootstrap'
import type { ActionChoiceOption, GameState, PlayerState } from '../../shared/contract/types'
import { sixPlayerDuplicateMajorImprovementIds } from '../../shared/cards/major/supply'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'

const oneCellFences = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const firstEmptyFarmyardTile = (player: PlayerState) => {
  const occupied = new Set<string>()
  player.roomTiles.forEach((tile) => occupied.add(positionKey(tile)))
  player.farmTerrain?.forEach((tile) => occupied.add(positionKey(tile)))
  player.fields.forEach((field) => occupied.add(positionKey(field)))
  player.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  player.pastures.forEach((pasture) => pasture.tiles.forEach((tile) => occupied.add(positionKey(tile))))
  const tile = getAllTilePositions().find((tile) => !occupied.has(positionKey(tile)))
  expect(tile).toBeDefined()
  return tile!
}

const prepareHands = (session: GameSession) => {
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}

const setupFarmersOfTheMoorSeason = (season: SeasonId) => {
  const session = new GameSession(365, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
    enableThroughTheSeasons: true,
  })
  session.state.currentPlayerIndex = 0
  session.state.round = 1
  session.state.roundPhase = 'work'
  if (season === 'spring') session.state.roundActionOrder[0] = 'fencing'
  session.state.throughTheSeasons = { startSeason: season, currentSeason: season }
  prepareHands(session)
  const player = session.state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(session.state, player, 2)
  session.loadState(session.state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const findSpecialCard = (session: GameSession, actionId: string) => {
  const card = session.state.farmersOfTheMoor!.specialActionCards.find((candidate) =>
    candidate.actions.includes(actionId as never),
  )
  expect(card).toBeDefined()
  return card!
}

const hasPaidResources = (
  option: { labelParams?: Record<string, unknown> },
  expected: Record<string, number>,
) => {
  const actual = (option.labelParams?.resourcesPaid ?? {}) as Record<string, number>
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  return [...keys].every((key) => (actual[key] ?? 0) === (expected[key] ?? 0))
}

const choosePaymentByResources = (
  session: GameSession,
  resp: SessionResponse,
  expected: Record<string, number>,
) => {
  expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
  const option = resp.interaction.request.options?.find((candidate) =>
    hasPaidResources(candidate, expected),
  )
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const readMajorSupply = (state: GameState) => state.majorImprovementSupply ?? []

describe('Farmers of the Moor compatibility regressions', () => {
  it.each([2, 3, 4, 5, 6])('keeps Farmers of the Moor disabled setup unchanged for %i players', (playerCount) => {
    const state = createInitialState(3650 + playerCount, {
      playerCount,
      enableThroughTheSeasons: true,
      enableCommunityDeck: true,
      deckIds: ['A', 'B', 'C', 'D', 'E'],
    })

    expect(state.enableFarmersOfTheMoor).toBe(false)
    expect(state.farmersOfTheMoor).toBeNull()
    expect(state.actionSpaces.map((space) => space.id)).not.toEqual(
      expect.arrayContaining(['moor-infirmary', 'moor-resource-market-12']),
    )
    for (const player of state.players) {
      expect(player.minorHand).toHaveLength(7)
      expect(player.occupationHand).toHaveLength(7)
      expect(player.farmTerrain).toBeUndefined()
      expect(player.sickWorkerIds).toBeUndefined()
      expect(player.resources.fuel).toBeUndefined()
      expect(player.resources.horse).toBeUndefined()
    }
  })

  it('keeps Through the Seasons summer harvest from requesting Farmers of the Moor heating', () => {
    const session = setupFarmersOfTheMoorSeason('summer')
    for (const player of session.state.players) {
      markAllWorkersUsed(session.state, player)
      player.resources.food = 10
      player.resources.fuel = 0
    }

    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' && (resp.interaction.request as { kind: string }).kind === 'heating').toBe(false)
    expect(session.state.players[0]!.sickWorkerIds).toEqual([])
    expect(session.state.players[1]!.sickWorkerIds).toEqual([])
  })

  it('keeps the Autumn major discount mandatory on the Farmers of the Moor major supply', () => {
    const session = setupFarmersOfTheMoorSeason('autumn')
    const player = session.state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 2,
      stone: 2,
      clay: 0,
      reed: 0,
      food: 0,
    }

    let resp = session.takeAction(0, 'major-improvement')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected major choice')
    expect(resp.interaction.request.options?.map((option: ActionChoiceOption) => option.value)).toContain('Major_Joinery')

    resp = session.resolveChoice(0, 'Major_Joinery')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected payment choice')
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 2, stone: 2 }))).toBe(false)
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 1, stone: 2 }))).toBe(true)

    resp = choosePaymentByResources(session, resp, { wood: 1, stone: 2 })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
  })

  it('lets Winter Slash and Burn use a Farmers of the Moor forest without paying the Winter plowing surcharge', () => {
    const session = setupFarmersOfTheMoorSeason('winter')
    const player = session.state.players[0]!
    player.resources.food = 0
    const forest = player.farmTerrain!.find((tile) => tile.kind === 'forest')!
    const card = findSpecialCard(session, 'slash-and-burn')

    const resp = session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: forest })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: forest.row,
      col: forest.col,
      stacks: [],
    })
    expect(resp.state.players[0]!.farmTerrain).not.toContainEqual(forest)
  })

  it('keeps Spring fence discount ordering with Farmers of the Moor enabled', () => {
    const session = setupFarmersOfTheMoorSeason('spring')
    const player = session.state.players[0]!
    player.resources.wood = 1
    storePendingFenceBonus(player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 3,
    })

    expect(availableIds(session)).toContain('fencing')
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    const tile = firstEmptyFarmyardTile(player)
    resp = session.commitSelectionChoice(0, {
      edges: oneCellFences(tile.row, tile.col),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('runs Parent Cards selection after Farmers of the Moor setup and leaves the variant state active', () => {
    const session = new GameSession(366, undefined, {
      playerCount: 2,
      enableParentCards: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      parentSelectionSeed: 9001,
    })
    const originalFarmersOfTheMoor = structuredClone(session.state.farmersOfTheMoor)

    expect(session.state.phase).toBe('parent-selection')
    expect(session.state.parentSelection).not.toBeNull()
    expect(session.state.players[0]!.minorHand).toHaveLength(7)
    expect(session.state.players[0]!.minorHand.filter((id) => id.startsWith('M'))).toHaveLength(4)
    expect(session.state.players[0]!.farmTerrain).toHaveLength(8)

    const p1Candidates = session.state.parentSelection!.candidates.p1
    const p2Candidates = session.state.parentSelection!.candidates.p2
    expect(session.submitParentSelection(0, {
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    }).ok).toBe(true)
    const resp = session.submitParentSelection(1, {
      mother: p2Candidates.mother[0],
      father: p2Candidates.father[0],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.phase).toBe('playing')
    expect(resp.state.farmersOfTheMoor).toEqual(originalFarmersOfTheMoor)
    expect(resp.state.players[0]!.farmTerrain).toHaveLength(8)
    expect(resp.state.players[0]!.parentCards.mother).toBe(p1Candidates.mother[0])
  })

  it.each([5, 6])('uses Farmers of the Moor action spaces and major supply for %i players', (playerCount) => {
    const state = createInitialState(3670 + playerCount, {
      playerCount,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const actionIds = state.actionSpaces.map((space) => space.id)
    const infirmary = state.actionSpaces.find((space) => space.id === 'moor-infirmary')
    const majorSupplyIds = readMajorSupply(state).flatMap((stack) => stack.cardIds)

    expect(actionIds).toContain('moor-infirmary')
    expect(actionIds).not.toContain('moor-resource-market-12')
    expect(infirmary?.maxOccupancy).toBeNull()
    expect(readMajorSupply(state)).toHaveLength(12)
    expect(sixPlayerDuplicateMajorImprovementIds.some((id) => majorSupplyIds.includes(id))).toBe(false)
  })
})
