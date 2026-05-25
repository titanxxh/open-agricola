import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type {
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../shared/contract/types'

import '../../shared/cards/D/D137_TradeTeacher'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'


const CARD_ID = 'D137_TradeTeacher'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, takenBy: string | null = null): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy,
  }) as unknown as ActionSpace

const createState = (
  players: PlayerState[],
  spaces: ActionSpace[],
): GameState =>
  ({
    round: 3,
    currentPlayerIndex: 0,
    players,
    actionSpaces: spaces,
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

const findListener = () =>
  getRegisteredCardListeners().find((l) => l.id === 'D137-trade-teacher-after-lessons')

describe('D137_TradeTeacher listener', () => {
  it('is registered on place-farmer after (player scope)', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('place-farmer')
    expect(listener!.phases).toContain('after')
    expect(listener!.scope).toBe('player')
  })


  it('does nothing on unrelated spaces (e.g. forest)', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const forest = createSpace('forest', player.id)
    const state = createState([player], [forest])

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('returns optional XOR over singles + distinct pairs on lessons', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const lessons = createSpace('lessons', player.id)
    const state = createState([player], [lessons])

    const result = executeCardListener(listener, {
      state,
      player,
      space: lessons,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('xor')
    expect(flow.optional).toBe(true)
    // 6 singles + C(6,2) = 15 pairs = 21 options.
    expect(flow.children).toHaveLength(21)

    // Each option is a seq of pay-resources + gain.
    for (const child of flow.children) {
      expect(child.type).toBe('seq')
      expect(child.children[0].actionId).toBe('pay')
      expect(child.children[1].actionId).toBe('gain')
    }
  })

  it('triggers on lessons-4 as well', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const lessons4 = createSpace('lessons-4', player.id)
    const state = createState([player], [lessons4])

    const result = executeCardListener(listener, {
      state,
      player,
      space: lessons4,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
  })

  it('triggers on lessons-3 as well', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const lessons3 = createSpace('lessons-3', player.id)
    const state = createState([player], [lessons3])

    const result = executeCardListener(listener, {
      state,
      player,
      space: lessons3,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
  })

  it('cattle costs 2 food, grain costs 1 food (verified on combo flow params)', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const lessons = createSpace('lessons', player.id)
    const state = createState([player], [lessons])

    const result = executeCardListener(listener, {
      state,
      player,
      space: lessons,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    // Find the combo that gains only cattle.
    const cattleOnly = flow.children.find(
      (c: ActionFlow) =>
        c.children[1].params?.cattle === 1 &&
        Object.keys(c.children[1].params).length === 1,
    )
    expect(cattleOnly).toBeDefined()
    expect(cattleOnly.children[0].params).toEqual({ food: 2 })

    // grain only → 1 food.
    const grainOnly = flow.children.find(
      (c: ActionFlow) =>
        c.children[1].params?.grain === 1 &&
        Object.keys(c.children[1].params).length === 1,
    )
    expect(grainOnly).toBeDefined()
    expect(grainOnly.children[0].params).toEqual({ food: 1 })

    // grain + cattle pair → 3 food, gain both.
    const grainCattle = flow.children.find(
      (c: ActionFlow) =>
        c.children[1].params?.grain === 1 &&
        c.children[1].params?.cattle === 1,
    )
    expect(grainCattle).toBeDefined()
    expect(grainCattle.children[0].params).toEqual({ food: 3 })
  })
})

describe('D137_TradeTeacher end-to-end via GameSession', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    // Plenty of food for any combo plus the Lessons cost itself.
    player.resources.food = 10
    setWorkersAtHome(state, player, 1)
    state.players[1]!.workersAvailable = 1
    // Needs at least one occupation in hand to take Lessons (if Lessons requires it).
    player.occupationHand.push('A1_WoodCutter')

    session.loadState(state)
    return session
  }

  const walk = (session: GameSession, resp: SessionResponse) => {
    let r = resp
    let safety = 50
    while (safety-- > 0) {
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
        r = confirmPlayerSwitch(session)
        continue
      }
      break
    }
    return r
  }

  it('does not trigger on unrelated spaces', () => {
    const session = setup()
    const grainBefore = session.getState().state.players[0]!.resources.grain
    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    resp = walk(session, resp)
    // No D137 choice should appear; pending may be confirmPlayerSwitch or none.
    // No grain gained either way.
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(grainBefore)
  })
})
