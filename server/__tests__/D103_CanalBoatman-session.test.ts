import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { internalActionDefinitions } from '../../shared/actions/internal-actions'
import { executeCardListener, getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import { getRoundPlacementOrder } from '../../shared/cards/helpers/round-placement'
import type { ActionSpace, GameState, PlayerState , ActionFlow } from '../../shared/game/types'

import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/game/player'
import '../../shared/cards/D/D103_CanalBoatman'
import '../../shared/cards/D/D150_GodlySpouse'

const CARD_ID = 'D103_CanalBoatman'
const LISTENER_ID = 'D103-canal-boatman-after-place-farmer'

const createPlayer = (workersAvailable = 1): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 1,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    workersAvailable,
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [CARD_ID],houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    roundPhase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
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
    takenBy: [],
  }) as ActionSpace

const findListener = () =>
  getRegisteredCardListeners().find((listener) => listener.id === LISTENER_ID)

describe('D103_CanalBoatman listener', () => {
  it('registers spend-worker as an internal action', () => {
    expect(internalActionDefinitions.some((action) => action.id === 'spend-worker')).toBe(true)
  })

  it('returns optional seq after fishing with pay-resources -> spend-worker -> xor', () => {
    const listener = findListener()
    expect(listener).toBeDefined()

    const player = createPlayer(1)
    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fishing'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')

    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(3)
    expect(flow.children[0].actionId).toBe('pay-resources')
    expect(flow.children[0].params).toEqual({ food: 1 })
    expect(flow.children[1].actionId).toBe('spend-worker')
    expect(flow.children[2].type).toBe('xor')
    expect(flow.children[2].children).toHaveLength(2)
    expect(flow.children[2].children[0].actionId).toBe('gain')
    expect(flow.children[2].children[0].params).toEqual({ stone: 3 })
    expect(flow.children[2].children[1].actionId).toBe('gain')
    expect(flow.children[2].children[1].params).toEqual({ grain: 1, vegetable: 1 })
  })
})

describe('D103_CanalBoatman session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 1
    setWorkersAtHome(state, player, 2)
    const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    session.loadState(state)
    return session
  }

  it('accepting the optional flow spends 1 extra worker and 1 food for 3 stone', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const acceptOption = resp.pending.options.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    resp = session.resolveChoice(0, resp.pending.options[0]!.value)

    const player = resp.state.players[0]!
    expect(workersAvailable(resp.state, player)).toBe(0)
    expect(player.resources.food).toBe(2)
    expect(player.resources.stone).toBe(3)
    expect(player.resources.grain).toBe(0)
    expect(player.resources.vegetable).toBe(0)
  })

  it('accepting the extra worker keeps round placement order in sync', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    expect(getRoundPlacementOrder(resp.state.players[0]!)).toHaveLength(1)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const acceptOption = resp.pending.options.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    resp = session.resolveChoice(0, resp.pending.options[0]!.value)

    expect(getRoundPlacementOrder(resp.state.players[0]!)).toHaveLength(2)
  })

  it('D103 extra worker does not let D150_GodlySpouse miscount wish-children as second placement', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID, 'D150_GodlySpouse')
    setActiveWorkerCount(player, 3)
    setWorkersAtHome(state, player, 3)
    player.rooms = 4
    player.resources.food = 1

    const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    session.loadState(state)

    let resp = session.takeAction(0, 'fishing')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const acceptOption = resp.pending.options.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    resp = session.resolveChoice(0, resp.pending.options[0]!.value)

    const nextState = session.getState().state
    nextState.currentPlayerIndex = 0
    session.loadState(nextState)

    resp = session.takeAction(0, 'wish-children')
    expect(getRoundPlacementOrder(resp.state.players[0]!)).toHaveLength(3)
    if (resp.pending.type === 'choice') {
      expect(resp.pending.promptKey).not.toBe('ui.interactionGodlySpouse')
      expect(
        resp.pending.options.some((option) => option.labelKey === 'ui.interactionGodlySpouseUse'),
      ).toBe(false)
    }
  })
})
