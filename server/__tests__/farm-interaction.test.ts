import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types.ts'
import {
  buildFarmPositionSelectionInteraction,
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  buildSowFarmInteraction,
  buildStableFarmInteraction,
} from '../../shared/domain/farmyard'
import { A014_CarpentersHammer } from '../../shared/cards/A/A014_CarpentersHammer'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import { setWorkersAtHome } from '../../shared/domain/player'

const stableTradeModifiers: PlayerState['activeModifiers'] = [
  {
    type: 'trade',
    cardId: 'Test_Stable_Clay',
    appliesTo: ['stables'],
    from: { clay: 2 },
    to: { wood: 2 },
    max: 2,
  },
  {
    type: 'trade',
    cardId: 'Test_Stable_Stone',
    appliesTo: ['stables'],
    from: { stone: 2 },
    to: { wood: 2 },
    max: 2,
  },
]

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
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
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
})

describe('farm interaction builders', () => {
  it('limits room maxSelections using discounted room cost', () => {
    const player = createPlayer()
    player.resources.wood = 4
    player.resources.reed = 2

    const interaction = buildRoomFarmInteraction(player, { wood: -3 })

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(1)
  })

  it('respects explicit room limit from action context', () => {
    const player = createPlayer()
    player.resources.wood = 15
    player.resources.reed = 6

    const interaction = buildRoomFarmInteraction(player, undefined, { maxRooms: 1 })

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(1)
  })

  it('only offers room tiles reachable within the buildable room count', () => {
    const player = createPlayer()
    player.resources.wood = 5
    player.resources.reed = 2

    const interaction = buildRoomFarmInteraction(player)

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    const selectableKeys = new Set(
      interaction.selectableTiles.map((tile) => `${tile.row}-${tile.col}`),
    )
    expect(interaction.maxSelections).toBe(1)
    expect(selectableKeys).toEqual(new Set(['0-0', '1-1', '2-1']))
    expect(selectableKeys.has('0-4')).toBe(false)
  })

  it('counts frame builder replacement costs when computing room selections', () => {
    const player = createPlayer()
    player.houseType = 'clay'
    player.resources.wood = 2
    player.resources.clay = 6
    player.resources.reed = 4
    player.activeModifiers = [...(A123_FrameBuilder.impl.modifiers ?? [])]

    const interaction = buildRoomFarmInteraction(player)

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('counts Carpenter\'s Hammer discounts when computing room selections', () => {
    const player = createPlayer()
    player.resources.wood = 8
    player.resources.reed = 2
    player.activeModifiers = [...(A014_CarpentersHammer.impl.modifiers ?? [])]

    const interaction = buildRoomFarmInteraction(player)

    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('limits stable maxSelections using discounted stable cost', () => {
    const player = createPlayer()
    player.resources.wood = 2

    const interaction = buildStableFarmInteraction(player, { wood: -1 })

    expect(interaction.farmType).toBe('stable')
    if (interaction.farmType !== 'stable') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('counts stable payment alternatives when computing maxSelections', () => {
    const player = createPlayer()
    player.resources.clay = 2
    player.resources.stone = 2
    player.activeModifiers = [...stableTradeModifiers]

    const interaction = buildStableFarmInteraction(player)

    expect(interaction.farmType).toBe('stable')
    if (interaction.farmType !== 'stable') return
    expect(interaction.maxSelections).toBe(2)
  })

  it('returns no plow tiles when surcharge cannot be paid', () => {
    const player = createPlayer()
    player.fields = [{ crop: null, remaining: 0, row: 2, col: 1 }]
    player.resources.food = 0

    const interaction = buildPlowFarmInteraction(player, { food: 1 })

    expect(interaction.farmType).toBe('plow')
    if (interaction.farmType !== 'plow') return
    expect(interaction.selectableTiles).toEqual([])
  })

  it('rebuilds stable interaction with exactCost from pending action context', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players[0] = createPlayer()
    session.loadState(state)
    const player = session.getState().state.players[0]!

    const interaction = (session as unknown as {
      buildStableInteraction: (
        player: PlayerState,
        costOverride: undefined,
        actionContext: Record<string, unknown>,
      ) => ReturnType<typeof buildStableFarmInteraction>
    }).buildStableInteraction(player, undefined, { max: 1, exactCost: { max: 1 } })

    expect(interaction.farmType).toBe('stable')
    if (interaction.farmType !== 'stable') return
    expect(interaction.maxSelections).toBe(1)
  })

  it('rebuilds plow interaction with exactCost from pending action context', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players[0] = createPlayer()
    session.loadState(state)
    const player = session.getState().state.players[0]!

    const interaction = (session as unknown as {
      buildPlowInteraction: (
        player: PlayerState,
        costOverride: undefined,
        actionContext: Record<string, unknown>,
      ) => ReturnType<typeof buildPlowFarmInteraction>
    }).buildPlowInteraction(player, undefined, { exactCost: { max: 0 } })

    expect(interaction.farmType).toBe('plow')
    if (interaction.farmType !== 'plow') return
    expect(interaction.selectableTiles).toEqual([])
  })

  it('limits sow selectable fields using maxSelections and exclusions', () => {
    const player = createPlayer()
    player.resources.grain = 3
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
      { row: 1, col: 0, stacks: [] },
    ]

    const interaction = buildSowFarmInteraction(player, {
      maxSelections: 2,
      excludedFields: [{ row: 0, col: 1 }],
    })

    expect(interaction.farmType).toBe('sow')
    if (interaction.farmType !== 'sow') return
    expect(interaction.maxSelections).toBe(2)
    expect(interaction.selectableFields).toHaveLength(2)
    expect(interaction.selectableFields).toContainEqual({
      tile: { row: 0, col: 0 },
      allowedCrops: ['grain'],
    })
    expect(interaction.selectableFields).not.toContainEqual({
      tile: { row: 0, col: 1 },
      allowedCrops: ['grain'],
    })
  })

  it('builds farm-position selection interaction with positionFilter', () => {
    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ] as typeof player.fields

    const interaction = buildFarmPositionSelectionInteraction(player, {
      selectionKind: 'farm-position',
      positionFilter: 'has-grain',
      maxSelections: 1,
      minSelections: 0,
    })

    expect(interaction.kind).toBe('farm-position')
    expect(interaction.selectablePositions).toEqual([{ row: 0, col: 0 }])
    expect(interaction.maxSelections).toBe(1)
    expect(interaction.minSelections).toBe(0)
  })

  it('commitSelectionChoice commits farmland plow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const pending = session.takeAction(0, 'farmland')
    expect(pending.ok).toBe(true)
    expect(pending.interaction.stateId === 'wait' ? pending.interaction.request.kind : null).toBe('farm-select')

    const resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ row: 0, col: 0, stacks: [] })
  })

  it('plow farm-select rejects cancel and keeps pending fields unchanged', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const pending = session.takeAction(0, 'farmland')
    expect(pending.ok).toBe(true)
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') return
    expect(pending.interaction.request.kind).toBe('farm-select')
    expect(pending.interaction.request.options?.map((option) => option.value)).toEqual(['confirm'])

    const rejected = session.commitSelectionChoice(0, { cancel: true })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('action cancel is not allowed')
    expect(rejected.interaction.stateId).toBe('wait')
    if (rejected.interaction.stateId !== 'wait') return
    expect(rejected.interaction.request.kind).toBe('farm-select')
    expect(rejected.state.players[0]!.fields).toEqual([])
  })

  it('fence farm-select rejects empty selection and keeps pending interaction', () => {
    const session = new GameSession(260628, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    const player = state.players[0]!
    player.resources.wood = 10
    setWorkersAtHome(state, player, 2)
    session.loadState(state)

    const pending = session.takeAction(0, 'fencing')
    expect(pending.ok).toBe(true)
    expect(pending.interaction.stateId === 'wait' ? pending.interaction.request.kind : null).toBe('farm-select')

    const rejected = session.commitSelectionChoice(0, {
      edges: [],
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('NO_NEW_FENCES')
    expect(rejected.interaction.stateId).toBe('wait')
    if (rejected.interaction.stateId !== 'wait') return
    expect(rejected.interaction.request.kind).toBe('farm-select')
    expect(rejected.interaction.promptKey).toBe('ui.interactionFenceSelect')
    expect(rejected.state.currentPlayerIndex).toBe(0)
    expect(rejected.state.players[0]!.fenceSegments).toEqual([])
  })

  it('rejects direct resolveChoice farm payload on farm-select', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const pending = session.takeAction(0, 'farmland')
    expect(pending.ok).toBe(true)
    expect(pending.interaction.stateId === 'wait' ? pending.interaction.request.kind : null).toBe('farm-select')

    const payload = { tile: { row: 0, col: 0 } }
    const rejected = session.resolveChoice(0, 'confirm', payload)

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('use commitSelectionChoice for selection')
  })
})
