import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/C/C093_InnerDistrictsDirector'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C093_InnerDistrictsDirector'

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
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as PlayerState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const createState = (player: PlayerState): GameState => {
  const forestSpace = createSpace('forest')
  const clayPitSpace = createSpace('clay-pit')
  return {
    round: 1, currentPlayerIndex: 0, players: [player],
    actionSpaces: [forestSpace, clayPitSpace], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  } as GameState
}

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

const FILLER = '__test_placeholder__'

const setupParity = ({ played = true, workersAtHome = 2 } = {}) => {
  const session = new GameSession(5093, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  setWorkersAtHome(state, player, workersAtHome)
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
  forest.resources = { ...forest.resources, wood: 3, stone: 0 }
  clayPit.resources = { ...clayPit.resources, clay: 2, stone: 0 }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const resolveCardTrigger = (session: GameSession, response: ReturnType<GameSession['takeAction']>) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

const chooseNonSkip = (session: GameSession, response: ReturnType<GameSession['takeAction']>) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected optional choice')
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const acceptCard = (session: GameSession, response: ReturnType<GameSession['takeAction']>) =>
  chooseNonSkip(session, resolveCardTrigger(session, response))

const countStone = (response: ReturnType<GameSession['takeAction']>, spaceId: string) =>
  response.state.actionSpaces.find((space) => space.id === spaceId)?.resources.stone ?? 0

const playerWorkersOn = (response: ReturnType<GameSession['takeAction']>, spaceId: string) => {
  const playerId = response.state.players[0]!.id
  return response.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy
    .filter((worker) => worker.playerId === playerId).length ?? 0
}

describe('C093_InnerDistrictsDirector', () => {
  it('returns a special-effect flow that places 1 stone on clay-pit when using forest', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const forestSpace = state.actionSpaces.find(s => s.id === 'forest')!
    const clayPitSpace = state.actionSpaces.find(s => s.id === 'clay-pit')!

    expect(clayPitSpace.resources.stone).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: forestSpace,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    // Listener stays pure; the returned special-effect leaf performs the mutation.
    expect(clayPitSpace.resources.stone).toBe(0)
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.optional).toBe(true)
    const children = flow.children
    expect(children[0]).toMatchObject({
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'clay-pit', resource: 'stone', amount: 1 },
    })
    expect(children[1]).toMatchObject({ actionId: 'place-farmer', optional: true })

    specialEffectAction.execute({
      state,
      player,
      space: forestSpace,
      sourceCard: CARD_ID,
      params: (children[0] as Extract<ActionFlow, { type: 'leaf' }>).params,
    })
    expect(clayPitSpace.resources.stone).toBe(1)
  })

  it('returns a special-effect flow that places 1 stone on forest when using clay-pit', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const forestSpace = state.actionSpaces.find(s => s.id === 'forest')!
    const clayPitSpace = state.actionSpaces.find(s => s.id === 'clay-pit')!

    expect(forestSpace.resources.stone).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: clayPitSpace,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(forestSpace.resources.stone).toBe(0)
    expect(result?.flow?.type).toBe('seq')
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.optional).toBe(true)
    const children = flow.children
    expect(children[0]).toMatchObject({
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'add-resource-to-space', spaceId: 'forest', resource: 'stone', amount: 1 },
    })
    expect(children[1]).toMatchObject({ actionId: 'place-farmer', optional: true })
  })

  it('returns only the add-resource leaf when no workers are available', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    markAllWorkersUsed(state, player)

    const result = executeCardListener(listener!, {
      state, player, space: state.actionSpaces.find(s => s.id === 'forest')!,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow?.type).toBe('seq')
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.optional).toBe(true)
    expect(flow.children).toEqual([
      expect.objectContaining({
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'add-resource-to-space', spaceId: 'clay-pit', resource: 'stone', amount: 1 },
      }),
    ])
    expect(state.actionSpaces.find(s => s.id === 'clay-pit')!.resources.stone).toBe(0)
  })

  it('does not trigger on unrelated spaces', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('skipping the outer optional leaves paired action space stone unchanged', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    for (const player of state.players) {
      setWorkersAtHome(state, player, 2)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')!
    forest.resources.wood = 3
    clayPit.resources.stone = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'forest')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    if (resp.interaction.request.kind === 'select-trigger') {
      const trigger = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(trigger).toBeDefined()
      resp = session.resolveChoice(0, trigger!.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
    expect(resp.interaction.request.options?.map((option) => option.value)).toContain('__skip__')

    resp = session.resolveChoice(0, '__skip__')

    expect(resp.state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.stone ?? 0).toBe(0)
  })

  it('C093 S1: Inner Districts Director can be played as the first occupation for no food', () => {
    const session = setupParity({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C093 S2: after Forest, accepting adds stone to Clay Pit and permits another placement', () => {
    const session = setupParity()
    let response = acceptCard(session, session.takeAction(0, 'forest'))

    expect(countStone(response, 'clay-pit')).toBe(1)
    response = chooseNonSkip(session, response)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected placement choice')
    expect(response.interaction.request.options?.some((option) => option.value === 'day-laborer')).toBe(true)
    response = session.resolveChoice(response.interaction.playerIndex, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 22 })
    expect(playerWorkersOn(response, 'forest')).toBe(1)
    expect(playerWorkersOn(response, 'day-laborer')).toBe(1)
  })

  it('C093 S3: after Clay Pit, stone can be added to Forest while declining the extra placement', () => {
    const session = setupParity()
    let response = acceptCard(session, session.takeAction(0, 'clay-pit'))

    expect(countStone(response, 'forest')).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected optional placement')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(playerWorkersOn(response, 'clay-pit')).toBe(1)
    expect(playerWorkersOn(response, 'day-laborer')).toBe(0)
  })

  it('C093 S4: declining the card after Forest adds no stone and places no extra person', () => {
    const session = setupParity()
    let response = resolveCardTrigger(session, session.takeAction(0, 'forest'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected card choice')

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(countStone(response, 'clay-pit')).toBe(0)
    expect(playerWorkersOn(response, 'forest')).toBe(1)
    expect(response.state.actionSpaces.flatMap((space) => space.takenBy)
      .filter((worker) => worker.playerId === response.state.players[0]!.id)).toHaveLength(1)
  })

  it('C093 S5: a non-Forest, non-Clay-Pit placement does not trigger the card', () => {
    const response = setupParity().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(countStone(response, 'forest')).toBe(0)
    expect(countStone(response, 'clay-pit')).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('C093 S6: with no person left, accepting still adds stone but offers no extra placement', () => {
    const session = setupParity({ workersAtHome: 1 })
    const response = acceptCard(session, session.takeAction(0, 'forest'))

    expect(countStone(response, 'clay-pit')).toBe(1)
    expect(playerWorkersOn(response, 'forest')).toBe(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('C093 S7: the extra Clay Pit placement can trigger the ability a second time in one turn', () => {
    const session = setupParity()
    let response = acceptCard(session, session.takeAction(0, 'forest'))
    response = chooseNonSkip(session, response)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected placement choice')
    response = session.resolveChoice(response.interaction.playerIndex, 'clay-pit')
    response = acceptCard(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, stone: 1 })
    expect(countStone(response, 'forest')).toBe(1)
    expect(playerWorkersOn(response, 'forest')).toBe(1)
    expect(playerWorkersOn(response, 'clay-pit')).toBe(1)
  })
})
