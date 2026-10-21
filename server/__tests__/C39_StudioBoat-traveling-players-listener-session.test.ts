import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C039_StudioBoat'
import { createWorkSession } from './_helpers/session-fixtures'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'

const CARD_ID = 'C039_StudioBoat'
const LISTENER_ID = 'C39-studio-boat-traveling-players-vp'
const FIXED_HANDS = [
  { occupation: '__c039_occupation_p1__', minor: '__c039_minor_p1__' },
  { occupation: '__c039_occupation_p2__', minor: '__c039_minor_p2__' },
  { occupation: '__c039_occupation_p3__', minor: '__c039_minor_p3__' },
  { occupation: '__c039_occupation_p4__', minor: '__c039_minor_p4__' },
]

const setupFourPlayerSession = (actorIndex: number) => {
  const session = new GameSession(39, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actorIndex
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
  })
  state.players[0]!.minorPlayed = [CARD_ID]
  session.loadState(state)
  return session
}

const createPlayer = (id = 'p1', minorPlayed: string[] = []): PlayerState =>
  ({
    id, name: id, color: 'red',
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
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed,
    occupationHand: [], occupationPlayed: [],
    houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: [],
  }) as unknown as ActionSpace

const createState = (players: PlayerState[], spaces: ActionSpace[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: spaces, log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = (ruleOwner: TestCardRegistry) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === LISTENER_ID)
  return withActiveRegistry(ruleOwner, lookupRule1)
}

describe('C039_StudioBoat — traveling-players bonus VP listener', () => {
  it('returns a bonus-vp flow leaf when the actor places on traveling-players', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const owner = createPlayer('p1', [CARD_ID])
    const travelingPlayers = createSpace('traveling-players')
    const state = createState([owner], [travelingPlayers])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player: owner,
      space: travelingPlayers,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.sourceCard).toBe(CARD_ID)
    expect(result!.flow).toEqual({
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    })
  })

  it('returns void when the placement is on a different space', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const owner = createPlayer('p1', [CARD_ID])
    const otherSpace = createSpace('fishing')
    const state = createState([owner], [otherSpace])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player: owner,
      space: otherSpace,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('returns void when there is no space on the context', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const owner = createPlayer('p1', [CARD_ID])
    const state = createState([owner], [])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player: owner,
      space: undefined,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })
})

describe('C039 Studio Boat four-player session', () => {
  it.each([
    { actorIndex: 0, expectedBonusVp: 1 },
    { actorIndex: 1, expectedBonusVp: 0 },
  ])('C039 S3: four-player actor $actorIndex uses global Traveling Players and leaves owner at $expectedBonusVp bonus VP', ({ actorIndex, expectedBonusVp }) => {
    const session = setupFourPlayerSession(actorIndex)
    const before = session.getState().state

    expect(before.actionSpaces.some((space) => space.id === CARD_ID)).toBe(false)
    expect(before.actionSpaces.some((space) => space.id === 'traveling-players')).toBe(true)

    const response = session.takeAction(actorIndex, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(expectedBonusVp)
  })

  it('C039 S4: the owner gains no bonus VP on a non-Traveling-Players action', () => {
    const session = setupFourPlayerSession(0)
    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('C039 before timing (#1322)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  const make = (actor: number) => {
    const session = createWorkSession({ seed: 1322039, options: { playerCount: 4 }, configure: state => {
      state.round = 14
      state.currentPlayerIndex = actor
      state.players[0]!.minorPlayed = [CARD_ID]
      state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 2
    } })
    sessions.push(session)
    return session
  }

  it('scores the bonus point before the Traveling Players food is collected', () => {
    const session = make(0)
    const food = session.state.players[0]!.resources.food
    const response = session.takeAction(0, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(food + 2)
    expectCardEffectBeforeHostCollect(response, { cardId: CARD_ID, spaceId: 'traveling-players', type: 'card.stateChanged' })
  })

  it('gives the owner nothing when an opponent uses Traveling Players', () => {
    const response = make(1).takeAction(1, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.state.events.some(event => event.type === 'card.stateChanged' && event.cardId === CARD_ID)).toBe(false)
  })
})
