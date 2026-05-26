import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionChoiceOption, ActionFlow, FarmTilePosition, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/C/C57_Crudite'

const CARD_ID = 'C57_Crudite'
const ANYTIME_ID = 'C57-crudite-anytime'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const setupSession = (fieldCounts = [3, 2, 1]) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 24
    player.resources.vegetable = 0
    markAllWorkersUsed(state, player)
  })

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.fields = fieldCounts.map((remaining, col) => ({
    row: 0,
    col,
    stacks: [{ kind: 'vegetable' as const, remaining }],
  }))

  session.loadState(state)
  return session
}

const setupAnytimeSession = (fieldCounts = [3, 2, 1]) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    player.resources.vegetable = 0
  })
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.fields = fieldCounts.map((remaining, col) => ({
    row: 0,
    col,
    stacks: [{ kind: 'vegetable' as const, remaining }],
  }))
  session.loadState(state)
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  return session
}

const fieldCountsOf = (player: PlayerState) =>
  player.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)

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

const expectC57Selection = (resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected C57 selection')
  expect(resp.interaction.selection?.kind).toBe('farm-position')
  expect(resp.interaction.selection?.minSelections).toBe(1)
  return resp.interaction.selection?.selectablePositions ?? []
}

const hasC57Selection = (resp: ReturnType<GameSession['performRoundEnd']>) =>
  resp.interaction.stateId === 'wait'
  && resp.interaction.selection?.kind === 'farm-position'
  && resp.interaction.sourceCard === CARD_ID

const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
  session.commitSelectionChoice(0, { positions })

describe('C57_Crudite', () => {
  it('onBuy offers pay 3 food for 1 vegetable when player has food', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.resources.food = 5
    const state = createState(player)

    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0].actionId).toBe('pay')
    expect(children[0].params).toEqual({ food: 3 })
    expect(children[1].actionId).toBe('gain')
    expect(children[1].params).toEqual({ vegetable: 1 })
  })

  it('onBuy returns undefined when player has < 3 food', () => {
    const effect = getCardEffect(CARD_ID)

    const player = createPlayer()
    player.resources.food = 2
    const state = createState(player)

    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('hook-level harvest returns optional selection and does not mutate fields', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    const state = createState(player)

    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect(flow!.optional).toBe(true)
    const selection = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(selection.actionId).toBe('selection')
    expect(selection.actionContext?.selectionKind).toBe('farm-position')
    expect(selection.actionContext?.selectableTiles).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }])
    expect(selection.actionContext?.minSelections).toBe(1)
    expect(selection.actionContext?.maxSelections).toBe(2)
    expect(fieldCountsOf(player)).toEqual([3, 2, 1])
  })

  it('harvest skip leaves C57 unused and normal reap harvests all fields', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = skipOptional(session, resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 1, 0])
    expect(player.resources.vegetable).toBe(3)
    expect(player.resources.food).toBe(20)
  })

  it('harvest multi-select A+B removes one vegetable from each before normal reap', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([1, 0, 0])
    expect(player.resources.vegetable).toBe(3)
    expect(player.resources.food).toBe(28)
  })

  it('harvest partial select B removes only that field before normal reap', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 1 }])

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 0, 0])
    expect(player.resources.vegetable).toBe(3)
    expect(player.resources.food).toBe(24)
  })

  it('anytime multi-select A+B removes one vegetable from each selected field', () => {
    const session = setupAnytimeSession()
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 1, 1])
    expect(player.resources.food).toBe(28)
  })

  it('anytime single source resolves without waiting for selection', () => {
    const session = setupAnytimeSession([2, 1])
    const resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(fieldCountsOf(player)).toEqual([1, 1])
    expect(player.resources.food).toBe(24)
  })

  it('invalid source selection A+C does not partially mutate fields or food', () => {
    const session = setupAnytimeSession()
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 2 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')
    expectC57Selection(resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([3, 2, 1])
    expect(player.resources.food).toBe(20)
  })

  it('empty or duplicate source selection fails and preserves C57 pending', () => {
    const session = setupAnytimeSession()
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)

    resp = selectPositions(session, [])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('not enough selection positions')
    expectC57Selection(resp)

    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 0 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('duplicate selection position')
    expectC57Selection(resp)

    resp = session.commitSelectionChoice(0, { cancel: true })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('action cancel is not allowed')
    expectC57Selection(resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([3, 2, 1])
    expect(player.resources.food).toBe(20)
  })

  it('no eligible fields offers no harvest C57 selection and no anytime action', () => {
    const harvestSession = setupSession([1, 1])
    const harvestResp = harvestSession.performRoundEnd()
    expect(hasC57Selection(harvestResp)).toBe(false)

    const harvestPlayer = harvestResp.state.players[0]!
    expect(fieldCountsOf(harvestPlayer)).toEqual([0, 0])
    expect(harvestPlayer.resources.vegetable).toBe(2)
    expect(harvestPlayer.resources.food).toBe(20)

    const anytimeSession = setupAnytimeSession([1, 1])
    const actionResp = anytimeSession.takeAnytimeAction(0, ANYTIME_ID)
    expect(actionResp.ok).toBe(false)
  })
})
