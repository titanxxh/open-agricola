import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { positionKey } from '../../shared/domain/farm'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { getFarmyardSpaceStates } from '../../shared/domain/farmyard-space-states'
import { getTerrainTiles } from '../../shared/moor/terrain-flow'
import { validateMoorSpecialActionEffect } from '../../shared/moor/special-actions'
import { M046_Thicket } from '../../shared/cards/M/M046_Thicket'
import { M047_BogForest } from '../../shared/cards/M/M047_BogForest'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { FarmTerrainTile } from '../../shared/moor/types'
import type { FarmTilePosition, GameState, PlayerState, Resource } from '../../shared/contract/types'

const FILLER = '__test_placeholder__'

const resources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 4,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
})

const forestA = { row: 0, col: 2, kind: 'forest' as const }
const forestB = { row: 0, col: 3, kind: 'forest' as const }
const forestC = { row: 1, col: 0, kind: 'forest' as const }
const forestD = { row: 1, col: 1, kind: 'forest' as const }
const moorA = { row: 1, col: 2, kind: 'moor' as const }
const moorB = { row: 1, col: 3, kind: 'moor' as const }

const coveredTerrain = (
  tile: FarmTilePosition,
  kind: 'forest' | 'moor',
  covered: 'forest' | 'moor',
) => ({ ...tile, kind, covered }) as FarmTerrainTile

const setup = (
  cardId: string,
  configure?: (player: PlayerState, state: GameState) => void,
) => {
  const session = new GameSession(398, undefined, {
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
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.minorHand = [cardId]
  player.farmTerrain = [
    { ...forestA },
    { ...forestB },
    { ...forestC },
    { ...forestD },
    { ...moorA },
    { ...moorB },
  ]
  configure?.(player, state)
  session.loadState(state)
  return session
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
  if (resp.interaction.stateId === 'wait' && resp.interaction.request.selection?.kind === 'farm-position') {
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

const commitPositions = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
  tiles: FarmTilePosition[],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.selection?.kind).toBe('farm-position')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    positions: tiles,
  })
}

const specialCardFor = (session: GameSession, actionId: string) =>
  session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
    card.actions.includes(actionId as never),
  )!

describe('M046/M047 covered farm terrain', () => {
  it('Fell Trees reveals covered terrain without treating the space as cleared', () => {
    const session = setup('M046_Thicket', (player) => {
      player.minorHand = [FILLER]
      player.minorPlayed = ['M096_FallowLand']
      player.farmTerrain = [coveredTerrain(forestA, 'forest', 'moor')]
    })
    const player = session.state.players[0]!
    const tile = { row: forestA.row, col: forestA.col }

    expect(validateMoorSpecialActionEffect(session.state, 0, 'slash-and-burn', { tile }).ok).toBe(false)

    const resp = session.takeSpecialAction(0, specialCardFor(session, 'fell-trees').id, 'fell-trees', { tile })

    expect(resp.ok).toBe(true)
    expect(player.resources.wood).toBe(2)
    expect(player.farmTerrain).toEqual([{ ...tile, kind: 'moor' }])
    expect(getFarmyardSpaceStates(player).filter((state) => state.spaceKey === positionKey(tile))).toEqual([])
    expect(validateMoorSpecialActionEffect(session.state, 0, 'cut-peat', { tile }).ok).toBe(true)
    expect(validateMoorSpecialActionEffect(session.state, 0, 'slash-and-burn', { tile }).ok).toBe(false)
  })

  it('M046 covers up to two visible forests with visible forests', () => {
    const session = setup('M046_Thicket')
    const player = session.state.players[0]!

    expect(meetsCardPrerequisites(player, M046_Thicket, session.state.round, session.state)).toBe(true)
    const resp = commitPositions(session, playMinor(session, 'M046_Thicket'), [forestA, forestB])

    expect(resp.ok).toBe(true)
    expect(getTerrainTiles(resp.state.players[0]!, 'forest')).toHaveLength(4)
    expect(resp.state.players[0]!.farmTerrain).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: forestA.row, col: forestA.col, kind: 'forest', covered: 'forest' }),
      expect.objectContaining({ row: forestB.row, col: forestB.col, kind: 'forest', covered: 'forest' }),
    ]))
    expect(validateMoorSpecialActionEffect(resp.state, 0, 'slash-and-burn', {
      tile: { row: forestA.row, col: forestA.col },
    }).ok).toBe(false)
  })

  it('M046 requires at least four visible forests', () => {
    const session = setup('M046_Thicket', (player) => {
      player.farmTerrain = [forestA, forestB, forestC, moorA, moorB]
    })
    const player = session.state.players[0]!

    expect(meetsCardPrerequisites(player, M046_Thicket, session.state.round, session.state)).toBe(false)
  })

  it('M047 covers selected moors with visible forests and hides the moors', () => {
    const session = setup('M047_BogForest', (player) => {
      player.resources.vegetable = 1
      player.improvements = ['Major_Well', 'Major_Joinery', 'Major_Pottery']
    })
    const player = session.state.players[0]!

    expect(meetsCardPrerequisites(player, M047_BogForest, session.state.round, session.state)).toBe(true)
    const resp = commitPositions(session, playMinor(session, 'M047_BogForest'), [moorA, moorB])

    expect(resp.ok).toBe(true)
    expect(getTerrainTiles(resp.state.players[0]!, 'moor')).toHaveLength(0)
    expect(getTerrainTiles(resp.state.players[0]!, 'forest')).toHaveLength(6)
    expect(resp.state.players[0]!.farmTerrain).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: moorA.row, col: moorA.col, kind: 'forest', covered: 'moor' }),
      expect.objectContaining({ row: moorB.row, col: moorB.col, kind: 'forest', covered: 'moor' }),
    ]))
    expect(validateMoorSpecialActionEffect(resp.state, 0, 'cut-peat', {
      tile: { row: moorA.row, col: moorA.col },
    }).ok).toBe(false)
    expect(validateMoorSpecialActionEffect(resp.state, 0, 'slash-and-burn', {
      tile: { row: moorA.row, col: moorA.col },
    }).ok).toBe(false)
  })
})
