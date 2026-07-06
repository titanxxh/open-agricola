import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { playerBoard } from '../../shared/domain'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { resetMoorSpecialActionCards } from '../../shared/moor/special-actions'
import type { FarmTilePosition, GameState, PlayerState, Resource } from '../../shared/contract/types'

const FILLER = '__test_placeholder__'

const resources = (): Resource => ({
  wood: 10,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 4,
  grain: 0,
  vegetable: 4,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
})

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const pasture00Edges = edgesForTile(0, 0)
const adjacentTerrainEdges = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = (
  cardId: string,
  configure?: (player: PlayerState, state: GameState) => void,
) => {
  const session = new GameSession(399, undefined, {
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
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.farmTerrain = []
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    player.fenceSegments = []
    player.farmyardExtensions = []
    player.farmyardSpaceStates = []
    player.roomTiles = [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.minorHand = [cardId]
  configure?.(player, state)
  session.loadState(state)
  return session
}

const addPasture00 = (player: PlayerState) => {
  player.fenceSegments = pasture00Edges.map((edge) => ({
    edge,
    type: 'fence',
    source: { kind: 'own', ownerPlayerId: player.id },
  }))
  player.pastures = [{
    id: 'pasture-1',
    size: 1,
    tiles: [{ row: 0, col: 0 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
}

const resolvePaymentIfNeeded = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
) => {
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.request.options?.[0]
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
  const improvement = resp.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  expect(improvement).toBeDefined()
  resp = session.resolveChoice(0, improvement!.value)
  expect(resp.ok).toBe(true)
  resp = resolvePaymentIfNeeded(session, resp)
  if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'farm-select') {
    return resp
  }
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionOptionalAction') {
    return resp
  }
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const card = resp.interaction.request.options?.find((option) => option.value === cardId)
  expect(card).toBeDefined()
  resp = session.resolveChoice(0, card!.value)
  expect(resp.ok).toBe(true)
  return resolvePaymentIfNeeded(session, resp)
}

const commitFence = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
  edges: string[],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.kind).toBe('farm-select')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    edges,
    extraWood: 0,
  })
}

const commitPlow = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
  tile: FarmTilePosition,
) => {
  if (
    resp.interaction.stateId === 'wait' &&
    resp.interaction.promptKey === 'ui.interactionOptionalAction'
  ) {
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, accept!.value)
  }
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.kind).toBe('farm-select')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, { tile })
}

const specialCardFor = (session: GameSession, actionId: string) =>
  session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
    card.actions.includes(actionId as never),
  )!

const resetToPlayerTurn = (session: GameSession) => {
  resetMoorSpecialActionCards(session.state)
  session.state.currentPlayerIndex = 0
  setActiveWorkerCount(session.state.players[0]!, 2)
  setWorkersAtHome(session.state, session.state.players[0]!, 2)
}

describe('M038/M039/M043 one-shot adjacency overrides', () => {
  it('M039 fences one disconnected non-adjacent pasture and ordinary later fencing remains connected', () => {
    const session = setup('M039_SpecialPasture', addPasture00)

    const committed = commitFence(session, playMinor(session, 'M039_SpecialPasture'), edgesForTile(2, 4))

    expect(committed.ok).toBe(true)
    expect(committed.state.players[0]!.pastures).toHaveLength(2)
    expect(committed.state.players[0]!.pastures.some((pasture) =>
      pasture.tiles.some((tile) => tile.row === 2 && tile.col === 4),
    )).toBe(true)
    expect(playerBoard(committed.state, 0).farmyard.canBuildFence({
      edges: edgesForTile(0, 4),
      options: { skipPayment: true },
    }).ok).toBe(false)
  })

  it('M039 rejects extra free fence segments outside the one-space special pasture', () => {
    const session = setup('M039_SpecialPasture', addPasture00)

    const committed = commitFence(session, playMinor(session, 'M039_SpecialPasture'), [
      ...edgesForTile(2, 4),
      'H-2-3',
    ])

    expect(committed.ok).toBe(false)
    expect(committed.state.players[0]!.pastures).toHaveLength(1)
  })

  it('M043 plows up to two non-adjacent fields and ordinary later plowing remains adjacent', () => {
    const session = setup('M043_WildFields', (player) => {
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ]
    })

    let resp = commitPlow(session, playMinor(session, 'M043_WildFields'), { row: 2, col: 4 })
    expect(resp.ok).toBe(true)
    resp = commitPlow(session, resp, { row: 2, col: 2 })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, col: 4 }),
      expect.objectContaining({ row: 2, col: 2 }),
    ]))
    expect(playerBoard(resp.state, 0).farmyard.canPlow({ row: 2, col: 0 }).ok).toBe(false)
  })

  it('M038 fenced terrain is not a pasture until visible and covered terrain are gone', () => {
    const session = setup('M038_NatureReserve', (player) => {
      addPasture00(player)
      player.farmTerrain = [{ row: 0, col: 1, kind: 'forest', covered: 'moor' }]
    })

    let resp = commitFence(session, playMinor(session, 'M038_NatureReserve'), adjacentTerrainEdges)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.pastures).toHaveLength(1)
    confirmNextPlayer(session)
    resetToPlayerTurn(session)
    resp = session.takeSpecialAction(0, specialCardFor(session, 'fell-trees').id, 'fell-trees', {
      tile: { row: 0, col: 1 },
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.farmTerrain).toEqual([{ row: 0, col: 1, kind: 'moor' }])
    expect(resp.state.players[0]!.pastures).toHaveLength(1)
    confirmNextPlayer(session)
    resetToPlayerTurn(session)
    resp = session.takeSpecialAction(0, specialCardFor(session, 'cut-peat').id, 'cut-peat', {
      tile: { row: 0, col: 1 },
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.farmTerrain).toEqual([])
    expect(resp.state.players[0]!.pastures).toHaveLength(2)
    expect(resp.state.players[0]!.pastures.some((pasture) =>
      pasture.tiles.some((tile) => tile.row === 0 && tile.col === 1),
    )).toBe(true)
  })

  it('M038 does not convert a Slash and Burn field into a pasture', () => {
    const session = setup('M038_NatureReserve', (player) => {
      addPasture00(player)
      player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
    })

    let resp = commitFence(session, playMinor(session, 'M038_NatureReserve'), adjacentTerrainEdges)
    expect(resp.ok).toBe(true)
    confirmNextPlayer(session)
    resetToPlayerTurn(session)
    resp = session.takeSpecialAction(0, specialCardFor(session, 'slash-and-burn').id, 'slash-and-burn', {
      tile: { row: 0, col: 1 },
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ row: 0, col: 1, stacks: [] })
    expect(resp.state.players[0]!.pastures).toHaveLength(1)
    expect(resp.state.players[0]!.pastures.some((pasture) =>
      pasture.tiles.some((tile) => tile.row === 0 && tile.col === 1),
    )).toBe(false)
  })
})
