import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { getCardEffect } from '../../shared/cards/card-effects'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { workersAvailable, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption, ActionFlow, GameState, PlayerState, Resource, SessionResponse } from '../../shared/contract/types'
import type { DraftGameEvent } from '../../shared/contract/events'
import { M036_PeatMoss } from '../../shared/cards/M/M036_PeatMoss'

import '../../shared/cards/register-all'

const PLACEHOLDER = '__test_placeholder__'

const fullResources = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

const setup = () => {
  const session = new GameSession(384, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const player of state.players) {
    player.resources = fullResources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.farmTerrain = []
    setWorkersAtHome(state, player, 2)
  }
  session.loadState(state)
  return session
}

const expectWait = (resp: SessionResponse) => {
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  return resp.interaction
}

const chooseByLabel = (resp: SessionResponse, labelKey: string) => {
  const interaction = expectWait(resp)
  const option = interaction.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return option!
}

const chooseNonSkip = (resp: SessionResponse) => {
  const interaction = expectWait(resp)
  const option = interaction.options?.find((entry: ActionChoiceOption) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return option!
}

const chooseConstructIfOffered = (session: GameSession, resp: SessionResponse) => {
  const interaction = expectWait(resp)
  if (interaction.request.kind === 'farm-select') return resp
  return session.resolveChoice(0, chooseByLabel(resp, 'actions.construct.name').value)
}

const selectRooms = (session: GameSession, resp: SessionResponse, count: number) => {
  const interaction = expectWait(resp)
  expect(interaction.request.kind).toBe('farm-select')
  expect(interaction.farm.farmType).toBe('room')
  if (interaction.farm.farmType !== 'room') throw new Error('expected room farm')
  expect(interaction.farm.maxSelections).toBeGreaterThanOrEqual(count)
  return session.commitSelectionChoice(interaction.playerIndex, {
    rooms: interaction.farm.selectableTiles.slice(0, count),
  })
}

const selectStables = (session: GameSession, resp: SessionResponse, count: number) => {
  const interaction = expectWait(resp)
  expect(interaction.request.kind).toBe('farm-select')
  expect(interaction.farm.farmType).toBe('stable')
  if (interaction.farm.farmType !== 'stable') throw new Error('expected stable farm')
  expect(interaction.farm.maxSelections).toBeGreaterThanOrEqual(count)
  return session.commitSelectionChoice(interaction.playerIndex, {
    stables: interaction.farm.selectableTiles.slice(0, count),
  })
}

const listenerById = (id: string) => {
  const listener = getRegisteredCardListeners().find((entry) => entry.id === id)
  expect(listener).toBeDefined()
  return listener!
}

const context = (
  cardId: string,
  actionId: string,
  player: PlayerState,
  state: GameState,
  overrides: Partial<CardListenerContext> = {},
) => ({
  state,
  player,
  space: state.actionSpaces.find((space) => space.id === 'forest')!,
  actionId,
  phase: 'after',
  result: { type: 'ok' },
  ...overrides,
}) as unknown as CardListenerContext

const moved = (resource: keyof Resource, amount: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { [resource]: amount } as Partial<Resource>,
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const exchanged = (exchangeSource: string): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid: { wood: 1 },
  gained: { food: 2 },
  paidFrom: { kind: 'player', playerId: 'p1' },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: 'p1' },
  exchangeSource,
})

const actionIds = (flow: ActionFlow | undefined): string[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow.actionId]
  if ('children' in flow) return flow.children.flatMap(actionIds)
  return []
}

describe('M036 Peat Moss', () => {
  it('requires no visible moors', () => {
    const session = setup()
    const player = session.state.players[0]!
    expect(meetsCardPrerequisites(player, M036_PeatMoss, 1, session.state)).toBe(true)
    player.farmTerrain = [{ row: 0, col: 0, kind: 'moor' }]
    expect(meetsCardPrerequisites(player, M036_PeatMoss, 1, session.state)).toBe(false)
  })

  it('builds a wooden room for 3 wood and 1 reed', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M036_PeatMoss']
    player.resources = fullResources({ wood: 3, reed: 1 })
    session.loadState(session.state)

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseConstructIfOffered(session, resp)
    resp = selectRooms(session, resp, 1)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })

  it('builds two wooden rooms for 6 wood and 2 reed', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M036_PeatMoss']
    player.resources = fullResources({ wood: 6, reed: 2 })
    session.loadState(session.state)

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseConstructIfOffered(session, resp)
    resp = selectRooms(session, resp, 2)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })
})

describe('M037 Building Plan', () => {
  it('only offers free stables after at least two rooms are built', () => {
    const session = setup()
    const state = session.state
    const player = state.players[0]!
    player.minorPlayed = ['M037_BuildingPlan']
    recordActionSnapshot(player, 1)
    player.roomTiles.push({ row: 0, col: 1 })
    const oneRoom = executeCardListener(listenerById('M037-building-plan-after-construct'), context('M037_BuildingPlan', 'construct', player, state))
    expect(oneRoom).toBeUndefined()

    player.roomTiles.push({ row: 0, col: 2 })
    const twoRooms = executeCardListener(listenerById('M037-building-plan-after-construct'), context('M037_BuildingPlan', 'construct', player, state))
    expect(twoRooms?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'stables',
      optional: true,
      sourceCard: 'M037_BuildingPlan',
      actionContext: { max: 2, exactCost: { wood: 0, max: 2 }, trueAction: false },
    })
  })

  it('places up to two free stables after a two-room build', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M037_BuildingPlan']
    player.resources = fullResources({ wood: 10, reed: 4 })
    session.loadState(session.state)

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseConstructIfOffered(session, resp)
    resp = selectRooms(session, resp, 2)
    resp = session.resolveChoice(0, chooseNonSkip(resp).value)
    resp = selectStables(session, resp, 2)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(2)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })
})

describe('M061 Hay Wagon', () => {
  it('offers Build Rooms or Renovation after enough building resources from an accumulation space', () => {
    const session = setup()
    const state = session.state
    const player = state.players[0]!
    player.id = 'p1'
    player.minorPlayed = ['M061_HayWagon']
    const events = [moved('wood', 3)]

    const result = executeCardListener(listenerById('M061-hay-wagon-after-collect'), context('M061_HayWagon', 'collect', player, state, {
      actionEvents: events,
      transactionEvents: events,
    }))

    expect(result?.flow).toMatchObject({ type: 'xor', optional: true })
    expect(actionIds(result?.flow)).toEqual(['construct', 'renovate-house'])
    const flow = result!.flow as Extract<ActionFlow, { type: 'xor' }>
    for (const child of flow.children) {
      expect(child.type).toBe('leaf')
      if (child.type === 'leaf') expect(child.actionContext?.trueAction).toBe(false)
    }
  })

  it('does not trigger below the accumulation thresholds', () => {
    const session = setup()
    const state = session.state
    const player = state.players[0]!
    player.id = 'p1'
    player.minorPlayed = ['M061_HayWagon']
    const events = [moved('wood', 2), moved('reed', 1)]

    const result = executeCardListener(listenerById('M061-hay-wagon-after-collect'), context('M061_HayWagon', 'collect', player, state, {
      actionEvents: events,
      transactionEvents: events,
    }))

    expect(result).toBeUndefined()
  })

  it('gifted Build Rooms does not consume an extra worker', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.id = 'p1'
    player.minorPlayed = ['M061_HayWagon']
    player.resources = fullResources({ wood: 2, reed: 2, horse: 2 })
    const forest = session.state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 3
    session.loadState(session.state)

    let resp = session.takeAction(0, 'forest')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    resp = session.resolveChoice(0, chooseByLabel(resp, 'actions.construct.name').value)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    resp = selectRooms(session, resp, 1)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'farm-expansion')?.takenBy).toEqual([])
  })
})

describe('M091 Routine Work', () => {
  it('marks craft buildings used from resource.exchanged exchangeSource', () => {
    const session = setup()
    const state = session.state
    state.roundPhase = 'feeding'
    const player = state.players[0]!
    player.id = 'p1'
    player.minorPlayed = ['M091_RoutineWork']
    const events = [exchanged('Major_Joinery')]

    const result = executeCardListener(listenerById('M091-routine-work-after-exchange'), context('M091_RoutineWork', 'exchange', player, state, {
      actionEvents: events,
      transactionEvents: events,
    }))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'M091_RoutineWork',
      params: { kind: 'set-extra-data', key: 'usedCraftBuildingIds', value: ['Major_Joinery'] },
    })
  })

  it('offers fuel or food for each unused craft building', () => {
    const session = setup()
    const state = session.state
    const player = state.players[0]!
    player.minorPlayed = ['M091_RoutineWork']
    player.improvements = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
    writeCardExtraData(player, 'M091_RoutineWork', 'usedCraftBuildingIds', ['Major_Joinery'])

    const flow = getCardEffect('M091_RoutineWork')?.onEndHarvestFeedingPhase?.(state, player)

    expect(flow?.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.children).toHaveLength(2)
    for (const child of seq.children) {
      expect(child.type).toBe('xor')
      if (child.type !== 'xor') continue
      expect(child.optional).toBe(true)
      expect(actionIds(child).sort()).toEqual(['gain', 'gain'])
      expect(child.children).toEqual([
        expect.objectContaining({ type: 'leaf', actionId: 'gain', params: { fuel: 1 } }),
        expect.objectContaining({ type: 'leaf', actionId: 'gain', params: { food: 1 } }),
      ])
    }
  })

  it('returns no reward when every craft building was used this harvest', () => {
    const session = setup()
    const state = session.state
    const player = state.players[0]!
    player.minorPlayed = ['M091_RoutineWork']
    player.improvements = ['Major_Joinery', 'Major_Pottery']
    writeCardExtraData(player, 'M091_RoutineWork', 'usedCraftBuildingIds', ['Major_Joinery', 'Major_Pottery'])

    const flow = getCardEffect('M091_RoutineWork')?.onEndHarvestFeedingPhase?.(state, player)

    expect(flow).toBeUndefined()
  })
})
