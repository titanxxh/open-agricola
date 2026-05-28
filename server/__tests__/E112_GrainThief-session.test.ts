import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionChoiceOption, ActionFlow, FarmTilePosition, Field, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/E/E112_GrainThief'

const CARD_ID = 'E112_GrainThief'

const makeField = (
  row: number,
  col: number,
  stacks: Array<{ kind: 'grain' | 'vegetable'; remaining: number }>,
): Field => ({ row, col, stacks })

const makePlayer = (): PlayerState => ({
  id: 'p1',
  name: 'p1',
  color: 'red',
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
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: ['__test_placeholder__'],
  minorPlayed: [],
  occupationHand: ['__test_placeholder__'],
  occupationPlayed: [CARD_ID],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
}) as PlayerState

const fieldCountsOf = (player: PlayerState) =>
  player.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)

const grainHarvestedCropsOf = (resp: ReturnType<GameSession['performRoundEnd']>, player: PlayerState) =>
  resp.state.harvestReapSummary?.[player.id]?.harvestedCrops?.filter((crop) => crop.crop === 'grain') ?? []

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    player.resources.grain = 0
    markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.fields = [
    makeField(0, 0, [{ kind: 'grain', remaining: 2 }]),
    makeField(0, 1, [{ kind: 'grain', remaining: 1 }]),
    makeField(0, 2, [{ kind: 'vegetable', remaining: 2 }]),
  ]
  session.loadState(state)
  return session
}

const selectE112Trigger = (session: GameSession, resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected trigger choice')
  const option = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const acceptOptional = (session: GameSession, resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const option = resp.interaction.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const skipOptional = (session: GameSession, resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const option = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const expectE112Selection = (resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected E112 selection')
  expect(resp.interaction.sourceCard).toBe(CARD_ID)
  expect(resp.interaction.selection?.kind).toBe('farm-position')
}

describe('E112_GrainThief harvest timing', () => {
  it('start field phase offers optional selection for grain fields and does not reap or gain immediately', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const player = makePlayer()
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 2 }]),
      makeField(0, 1, [{ kind: 'vegetable', remaining: 2 }]),
      makeField(0, 2, [{ kind: 'grain', remaining: 1 }]),
    ]

    const flow = effect!.onStartHarvestFieldPhase?.({ players: [player] } as never, player)

    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect(flow!.optional).toBe(true)
    const selection = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(selection.actionId).toBe('selection')
    expect(selection.sourceCard).toBe(CARD_ID)
    expect(selection.actionContext?.selectionKind).toBe('farm-position')
    expect(selection.actionContext?.selectableTiles).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 2 },
    ] satisfies FarmTilePosition[])
    expect(selection.actionContext?.minSelections).toBe(1)
    expect(selection.actionContext?.maxSelections).toBe(2)
    expect(fieldCountsOf(player)).toEqual([2, 2, 1])
    expect(player.resources.grain).toBe(0)
    expect(player.cardStates[CARD_ID]).toBeUndefined()
  })

  it('selection stores positions, main reap skips selected fields, and end phase gains grain then clears state', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = selectE112Trigger(session, resp)
    resp = acceptOptional(session, resp)
    expectE112Selection(resp)

    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }] })

    let player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 0, 1])
    expect(player.resources.grain).toBe(1)
    expect(player.cardStates[CARD_ID]?.extraData?.selectedPositions).toEqual(['0-0'])
    expect(grainHarvestedCropsOf(resp, player)).toEqual([
      { row: 0, col: 1, crop: 'grain', amount: 1, sources: ['base'] },
    ])

    resp = selectE112Trigger(session, resp)

    player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 0, 1])
    expect(player.resources.grain).toBe(2)
    expect(player.cardStates[CARD_ID]?.extraData?.selectedPositions).toBeUndefined()
    expect(resp.state.harvestReapSummary).toBeUndefined()
  })

  it('can select multiple grain fields and gains once per still valid selected field at end phase', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = selectE112Trigger(session, resp)
    resp = acceptOptional(session, resp)
    expectE112Selection(resp)

    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }] })

    let player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 1, 1])
    expect(player.resources.grain).toBe(0)
    expect(grainHarvestedCropsOf(resp, player)).toEqual([])

    resp = selectE112Trigger(session, resp)

    player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 1, 1])
    expect(player.resources.grain).toBe(2)
    expect(player.cardStates[CARD_ID]?.extraData?.selectedPositions).toBeUndefined()
  })

  it('optional skip does not write card state and normal reap harvests grain fields', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = selectE112Trigger(session, resp)
    resp = skipOptional(session, resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([1, 0, 1])
    expect(player.resources.grain).toBe(2)
    expect(player.cardStates[CARD_ID]).toBeUndefined()
    expect(resp.state.harvestReapSummary).toBeUndefined()
  })

  it('rejects illegal positions without mutating fields, resources, or selectedPositions', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = selectE112Trigger(session, resp)
    resp = acceptOptional(session, resp)
    expectE112Selection(resp)

    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })

    const player = resp.state.players[0]!
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')
    expectE112Selection(resp)
    expect(fieldCountsOf(player)).toEqual([2, 1, 2])
    expect(player.resources.grain).toBe(0)
    expect(player.cardStates[CARD_ID]).toBeUndefined()
  })

  it('rejects selection cancel without writing card state and keeps pending selection', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = selectE112Trigger(session, resp)
    resp = acceptOptional(session, resp)
    expectE112Selection(resp)

    resp = session.commitSelectionChoice(0, { cancel: true })

    const player = resp.state.players[0]!
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('action cancel is not allowed')
    expectE112Selection(resp)
    expect(fieldCountsOf(player)).toEqual([2, 1, 2])
    expect(player.resources.grain).toBe(0)
    expect(player.cardStates[CARD_ID]).toBeUndefined()
  })
})
