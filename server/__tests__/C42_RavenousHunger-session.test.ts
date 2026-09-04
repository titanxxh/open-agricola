import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionChoiceOption, GameState, PlayerState, ActionSpace, Resource } from '../../shared/contract/types'

import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/C/C042_RavenousHunger'
import '../../shared/cards/C/C076_WoodCart'
import { D116_TreeInspector_impl } from '../../shared/cards/D/D116_TreeInspector'
import '../../shared/cards/D/D138_PetLover'
import { applyRoundGrowth } from '../../shared/session/state-constants'
import type { ActionFlow } from '../../shared/contract/types'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

const CARD_ID = 'C042_RavenousHunger'
const WOOD_CART_ID = 'C076_WoodCart'
const TREE_INSPECTOR_ID = 'D116_TreeInspector'
const PET_LOVER_ID = 'D138_PetLover'

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
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string, gainPerRound: Partial<Record<string, number>> = {}): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound,
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

const resources = (values: Partial<Resource> = {}): Resource => ({
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
  ...values,
})

const setupSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources = resources()

  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.roundAvailable = Math.min(space.roundAvailable, 14)
  }

  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = 3
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')!
  fishing.resources.food = 2

  session.loadState(state)
  return session
}

const waitOptions = (resp: ReturnType<GameSession['getState']>): ActionChoiceOption[] => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return []
  expect(resp.interaction.request.kind).toBe('choice')
  return resp.interaction.request.options ?? []
}

const acceptOptional = (session: GameSession, resp: ReturnType<GameSession['getState']>) => {
  const accept = waitOptions(resp).find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(0, accept!.value)
}

const setupTreeInspectorSession = () => {
  const session = setupSession()
  const state = session.getState().state
  state.players[0]!.occupationPlayed.push(TREE_INSPECTOR_ID)
  session.loadState(state)
  const stateWithTreeInspector = session.getState().state
  stateWithTreeInspector.actionSpaces.find((space) => space.id === TREE_INSPECTOR_ID)!.resources.wood = 2
  session.loadState(stateWithTreeInspector)
  return session
}

const setupPetLoverSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 3 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.occupationPlayed.push(PET_LOVER_ID)
  player.resources = resources()
  player.pastures = [{
    id: 'sheep-pasture',
    size: 1,
    tiles: [{ row: 2, col: 0 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]

  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.roundAvailable = Math.min(space.roundAvailable, 14)
  }
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')!
  sheepMarket.resources.sheep = 1

  session.loadState(state)
  return session
}

describe('C042_RavenousHunger', () => {
  it('after vegetable-seeds: offers one extra placement constrained to accumulation spaces', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    state.actionSpaces = [createSpace('forest', { wood: 3 })]

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('place-farmer')
    expect(children[0].actionContext).toMatchObject({ constraints: expect.arrayContaining(['forest']) })
  })

  it('after vegetable-seeds: constraints include only legal accumulation spaces', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player, createPlayer('p2'))
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = [{ playerId: 'p2', workerId: '1' }]
    state.actionSpaces = [forest, createSpace('fishing', { food: 1 }), createSpace('farmland')]

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0].actionContext).toEqual({ constraints: ['fishing'] })
  })

  it('does not trigger on non-vegetable-seeds spaces', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('grain-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger when no workers available', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    markAllWorkersUsed(state, player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('vegetable-seeds'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('after its extra placement: gains the printed accumulation type', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const forest = createSpace('forest', { wood: 3 })
    forest.resources.clay = 4

    const result = executeCardListener(listener!, {
      state, player, space: forest,
      actionId: 'place-farmer', phase: 'after', sourceCard: CARD_ID,
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toMatchObject({ actionId: 'gain', params: { wood: 1 } })
  })

  it('does not grant the bonus after a normal placement', () => {
    const listener = findListener('C42-ravenous-hunger-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('after vegetable-seeds offers optional second placement restricted to accumulation spaces', () => {
    const session = setupSession()

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    expect(waitOptions(resp).map((option) => option.value)).toContain('__skip__')

    resp = acceptOptional(session, resp)
    const optionValues = waitOptions(resp).map((option) => option.value)
    const state = session.getState().state

    expect(optionValues).toContain('forest')
    expect(optionValues).toContain('fishing')
    expect(optionValues).not.toContain('farmland')
    expect(optionValues).not.toContain('day-laborer')
    expect(optionValues.every((spaceId) => {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
      return !!space && Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)
    })).toBe(true)
  })

  it('after vegetable-seeds does not offer a second placement when no accumulation space is legal', () => {
    const session = setupSession()
    const state = session.getState().state
    for (const space of state.actionSpaces) {
      if (Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)) {
        space.takenBy = [{ playerId: 'p2', workerId: '1' }]
      }
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'vegetable-seeds')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).not.toBe('choice')
  })

  it('second placement on an accumulation space collects and gains one extra accumulating resource', () => {
    const session = setupSession()

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    resp = acceptOptional(session, resp)
    resp = session.resolveChoice(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
    expect(readCardResourceStats(resp.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
  })

  it('offers Tree Inspector and gains one wood beyond the wood on its action space', () => {
    const session = setupTreeInspectorSession()

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    resp = acceptOptional(session, resp)
    expect(waitOptions(resp).map((option) => option.value)).toContain(TREE_INSPECTOR_ID)

    resp = session.resolveChoice(0, TREE_INSPECTOR_ID)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(3)
    expect(resp.state.actionSpaces.find((space) => space.id === TREE_INSPECTOR_ID)?.resources.wood).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === TREE_INSPECTOR_ID)?.takenBy)
      .toHaveLength(1)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { wood: 1 } }),
    }))
  })

  it('runs normal collect listeners when Tree Inspector is used', () => {
    const session = setupTreeInspectorSession()
    const state = session.getState().state
    state.players[0]!.minorPlayed.push(WOOD_CART_ID)
    session.loadState(state)

    const resp = session.takeAction(0, TREE_INSPECTOR_ID)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.actionSpaces.find((space) => space.id === TREE_INSPECTOR_ID)?.resources.wood).toBe(0)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: WOOD_CART_ID, gain: { wood: 2 } }),
    }))
  })

  it('accumulates Tree Inspector through round growth and clears it when a Quarry is revealed', () => {
    const session = setupTreeInspectorSession()
    const state = session.getState().state
    const treeInspector = state.actionSpaces.find((space) => space.id === TREE_INSPECTOR_ID)!

    applyRoundGrowth(state)
    expect(treeInspector.resources.wood).toBe(3)

    state.roundActionOrder[state.round - 1] = 'eastern-quarry'
    D116_TreeInspector_impl.effect!.onBeforeStartOfTurn!(state, state.players[0]!)
    expect(treeInspector.resources.wood).toBe(0)
  })

  it('gains the printed sheep type after Pet Lover replaces collect', () => {
    const session = setupPetLoverSession()

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    resp = acceptOptional(session, resp)
    resp = session.resolveChoice(0, 'sheep-market')
    const petLoverOption = waitOptions(resp).find((option) => option.sourceCard === PET_LOVER_ID)
    expect(petLoverOption).toBeDefined()

    resp = session.resolveChoice(0, petLoverOption!.value)
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg') {
      const sheep = resp.state.players[0]!.resources.sheep
      resp = session.resolveChoice(0, 'confirm', [{
        id: 'sheep-pasture',
        zoneType: 'pasture',
        animalType: 'sheep',
        animalCount: sheep,
      }])
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({
      vegetable: 1,
      sheep: 2,
      food: 3,
      grain: 1,
    })
    expect(resp.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'sheep',
      animalCount: 2,
    })
    expect(resp.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep).toBe(1)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { sheep: 1 } }),
    }))
  })

  it('skip grants no accumulation bonus', () => {
    const session = setupSession()

    const resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)
    const skipped = session.resolveChoice(0, '__skip__')

    expect(skipped.ok).toBe(true)
    expect(skipped.state.players[0]!.resources.vegetable).toBe(1)
    expect(skipped.state.players[0]!.resources.wood).toBe(0)
  })
})
