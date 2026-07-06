import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { getUnusedTerrainTiles } from '../../shared/moor/terrain-flow'
import { playerBoard } from '../../shared/domain'
import { reap } from '../../shared/actions/effects/reap'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { FarmTilePosition, FarmyardSpaceState, PlayerState, Resource } from '../../shared/contract/types'
import type { MoorSpecialActionId } from '../../shared/moor/types'

const PLACEHOLDER = '__test_placeholder__'
const DISCARD_ID = 'M111-no-till-farming-discard-crops'

const baseResources = (): Resource => ({
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
  fuel: 0,
  horse: 0,
})

const setup = () => {
  const session = new GameSession(396, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 6
  state.roundPhase = 'work'
  state.roundActionOrder[0] = 'grain-utilization'
  for (const player of state.players) {
    player.resources = baseResources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.farmTerrain = []
    player.stableTiles = []
    player.pastures = []
    player.farmyardSpaceStates = []
    setActiveWorkerCount(player, 3)
    setWorkersAtHome(state, player, 3)
  }
  session.loadState(state)
  return session
}

const resetOwnTurn = (session: GameSession) => {
  const player = session.state.players[0]!
  session.state.currentPlayerIndex = 0
  setActiveWorkerCount(player, 3)
  setWorkersAtHome(session.state, player, 3)
  session.loadState(session.state)
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
  if (improvement) {
    resp = session.resolveChoice(0, improvement.value)
    expect(resp.ok).toBe(true)
    resp = resolvePaymentIfNeeded(session, resp)
  }
  if (resp.state.players[0]!.minorPlayed.includes(cardId)) return resp
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
  resp: ReturnType<typeof playMinor> | ReturnType<GameSession['takeAnytimeAction']>,
  tiles: FarmTilePosition[],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.selection?.kind).toBe('farm-position')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    positions: tiles.map((tile) => ({ row: tile.row, col: tile.col })),
  })
}

const sow = (
  session: GameSession,
  crops: Array<FarmTilePosition & { crop: 'grain' | 'vegetable' }>,
) => {
  let resp = session.takeAction(0, 'grain-utilization')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
    const option = resp.interaction.request.options?.find((entry) => entry.value === 'sow')
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
  }
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, { crops })
}

const specialCard = (session: GameSession, actionId: MoorSpecialActionId) =>
  session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
    card.actions.includes(actionId),
  )!

const takeSpecialAt = (
  session: GameSession,
  actionId: MoorSpecialActionId,
  tile: FarmTilePosition,
) => session.takeSpecialAction(0, specialCard(session, actionId).id, actionId, { tile })

const acceptOptional = (
  session: GameSession,
  resp: ReturnType<GameSession['takeSpecialAction']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const statesOf = (player: PlayerState, cardId: string, kind: FarmyardSpaceState['kind']) =>
  player.farmyardSpaceStates?.filter((state) =>
    state.sourceCardId === cardId && state.kind === kind,
  ) ?? []

describe('Moor field goods and non-field crop spaces', () => {
  it('M095 places food on empty fields and normal sow claims it without treating it as crop', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M095_FallowFields']
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    session.loadState(session.state)

    let resp = playMinor(session, 'M095_FallowFields')
    resp = commitPositions(session, resp, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
    let after = resp.state.players[0]!
    expect(statesOf(after, 'M095_FallowFields', 'field-goods-token')).toEqual([
      {
        spaceKey: '0-0',
        sourceCardId: 'M095_FallowFields',
        kind: 'field-goods-token',
        resources: { food: 2 },
        claimPolicy: 'when-sowed',
      },
      {
        spaceKey: '0-1',
        sourceCardId: 'M095_FallowFields',
        kind: 'field-goods-token',
        resources: { food: 2 },
        claimPolicy: 'when-sowed',
      },
    ])

    resetOwnTurn(session)
    session.state.players[0]!.resources.grain = 1
    session.loadState(session.state)
    resp = sow(session, [{ row: 0, col: 0, crop: 'grain' }])
    after = resp.state.players[0]!
    expect(after.resources.food).toBe(2)
    expect(after.resources.grain).toBe(0)
    expect(after.fields.find((field) => field.row === 0 && field.col === 0)?.stacks)
      .toEqual([{ kind: 'grain', remaining: 3 }])
    expect(statesOf(after, 'M095_FallowFields', 'field-goods-token').map((state) => state.spaceKey))
      .toEqual(['0-1'])
  })

  it('M095 claims during private field phase but not ordinary harvest reap', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M095_FallowFields']
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    player.farmyardSpaceStates = [{
      spaceKey: '0-0',
      sourceCardId: 'M095_FallowFields',
      kind: 'field-goods-token',
      resources: { food: 2 },
      claimPolicy: 'when-sowed',
    }]
    session.loadState(session.state)

    reap(session.state, session.state.players[0]!)
    expect(session.state.players[0]!.resources.food).toBe(0)
    expect(statesOf(session.state.players[0]!, 'M095_FallowFields', 'field-goods-token')).toHaveLength(1)

    const privatePhase = setup()
    const privatePlayer = privatePhase.state.players[0]!
    privatePlayer.minorHand = ['E025_BumperCrop']
    privatePlayer.minorPlayed = ['M095_FallowFields']
    privatePlayer.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    privatePlayer.farmyardSpaceStates = [{
      spaceKey: '0-0',
      sourceCardId: 'M095_FallowFields',
      kind: 'field-goods-token',
      resources: { food: 2 },
      claimPolicy: 'when-sowed',
    }]
    privatePhase.loadState(privatePhase.state)

    const resp = playMinor(privatePhase, 'E025_BumperCrop')
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(statesOf(resp.state.players[0]!, 'M095_FallowFields', 'field-goods-token')).toEqual([])
  })

  it('M111 sows non-field crop spaces, keeps them unused, blocks placement, and discards selected crops anytime', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M111_NoTillFarming']
    player.resources.grain = 1
    player.resources.vegetable = 1
    session.loadState(session.state)

    let resp = sow(session, [
      { row: 0, col: 0, crop: 'grain' },
      { row: 0, col: 1, crop: 'vegetable' },
    ])
    let after = resp.state.players[0]!
    expect(statesOf(after, 'M111_NoTillFarming', 'non-field-crop-space')).toEqual([
      {
        spaceKey: '0-0',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'grain', remaining: 3 },
      },
      {
        spaceKey: '0-1',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'vegetable', remaining: 2 },
      },
    ])
    expect(after.resources.grain).toBe(0)
    expect(after.resources.vegetable).toBe(0)
    expect(getUsedFarmyardTileKeys(after)).not.toContain('0-0')
    expect(playerBoard(resp.state, 0).farmyard.selectableTiles('plow').selectableTiles)
      .not.toContainEqual({ row: 0, col: 0 })
    expect(playerBoard(resp.state, 0).farmyard.selectableTiles('room').selectableTiles)
      .not.toContainEqual({ row: 0, col: 0 })
    expect(playerBoard(resp.state, 0).farmyard.selectableTiles('stable').selectableTiles)
      .not.toContainEqual({ row: 0, col: 0 })
    expect(getUnusedTerrainTiles(after)).not.toContainEqual({ row: 0, col: 0 })
    expect(resp.interaction.anytimeActions.map((entry) => entry.id)).toContain(DISCARD_ID)

    resp = privateAnytimeDiscard(session, [{ row: 0, col: 0 }])
    after = resp.state.players[0]!
    expect(statesOf(after, 'M111_NoTillFarming', 'non-field-crop-space').map((state) => state.spaceKey))
      .toEqual(['0-1'])
    expect(getUnusedTerrainTiles(after)).toContainEqual({ row: 0, col: 0 })
  })

  it('M111 reaps one crop from each non-field crop space during harvest field phase', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M111_NoTillFarming']
    player.farmyardSpaceStates = [
      {
        spaceKey: '0-0',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'grain', remaining: 2 },
      },
      {
        spaceKey: '0-1',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'vegetable', remaining: 1 },
      },
    ]
    session.loadState(session.state)

    runCardEffectHook(session.state, player, 'M111_NoTillFarming', 'onHarvestFieldPhase')

    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
    expect(statesOf(player, 'M111_NoTillFarming', 'non-field-crop-space')).toEqual([
      {
        spaceKey: '0-0',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'grain', remaining: 1 },
      },
    ])
  })

  it('M112 optionally grows existing ordinary and non-field crops once before Cut Peat', () => {
    const target = { row: 2, col: 0 }
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M112_PeatAshFertilizer']
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 2, stacks: [] },
    ]
    player.farmTerrain = [{ ...target, kind: 'moor' }]
    player.farmyardSpaceStates = [
      {
        spaceKey: '1-0',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'grain', remaining: 3 },
      },
      {
        spaceKey: '1-1',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
      },
    ]
    session.loadState(session.state)

    let resp = takeSpecialAt(session, 'cut-peat', target)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('M112_PeatAshFertilizer')
    resp = acceptOptional(session, resp)
    const after = resp.state.players[0]!
    expect(after.fields.find((field) => field.row === 0 && field.col === 0)?.stacks)
      .toEqual([{ kind: 'grain', remaining: 3 }])
    expect(after.fields.find((field) => field.row === 0 && field.col === 1)?.stacks)
      .toEqual([{ kind: 'vegetable', remaining: 2 }])
    expect(after.fields.find((field) => field.row === 0 && field.col === 2)?.stacks)
      .toEqual([])
    expect(statesOf(after, 'M111_NoTillFarming', 'non-field-crop-space')).toEqual([
      {
        spaceKey: '1-0',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
        crop: { kind: 'grain', remaining: 4 },
      },
      {
        spaceKey: '1-1',
        sourceCardId: 'M111_NoTillFarming',
        kind: 'non-field-crop-space',
      },
    ])
    expect(after.resources.fuel).toBe(3)
  })
})

const privateAnytimeDiscard = (
  session: GameSession,
  tiles: FarmTilePosition[],
) => {
  let resp = session.takeAnytimeAction(0, DISCARD_ID)
  expect(resp.ok).toBe(true)
  resp = commitPositions(session, resp, tiles)
  expect(resp.ok).toBe(true)
  return resp
}
