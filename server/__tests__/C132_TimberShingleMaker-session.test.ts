import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C132_TimberShingleMaker'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C132_TimberShingleMaker'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 3, houseType: 'stone',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C132_TimberShingleMaker', () => {
  it('after renovate to stone: offers XOR to pay 1..N wood for bonus VP', () => {
    const listener = findListener('C132-timber-shingle-maker-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.rooms = 3
    player.resources.wood = 5
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('xor')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    // Should have 3 options (1 wood for 1VP, 2 for 2VP, 3 for 3VP)
    expect(children).toHaveLength(3)

    // First option: pay 1 wood, then increment-counter woodPlaced=1
    expect(children[0].type).toBe('seq')
    expect(children[0].children[0].actionId).toBe('pay')
    expect(children[0].children[0].params).toEqual({ wood: 1 })
    expect(children[0].children[1].actionId).toBe('special-effect')
    expect(children[0].children[1].params).toMatchObject({ kind: 'increment-counter', key: 'woodPlaced', amount: 1 })

    // Third option: pay 3 wood, then increment-counter woodPlaced=3
    expect(children[2].children[0].params).toEqual({ wood: 3 })
    expect(children[2].children).toHaveLength(2) // pay + 1 SE
    expect(children[2].children[1].params).toMatchObject({ kind: 'increment-counter', key: 'woodPlaced', amount: 3 })
  })

  it('does not trigger when house is not stone', () => {
    const listener = findListener('C132-timber-shingle-maker-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.houseType = 'clay'
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('limits wood to min of rooms and available wood', () => {
    const listener = findListener('C132-timber-shingle-maker-after-renovate')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.rooms = 5
    player.resources.wood = 2  // Only 2 wood available
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    // Should only have 2 options (limited by wood)
    expect(children).toHaveLength(2)
  })

  it('computeBonusScore returns woodPlaced counter', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.computeBonusScore).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { woodPlaced: 3 } },
    }
    const state = createState(player)

    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(3)
  })

  it('computeBonusScore returns 0 when no wood placed', () => {
    const effect = getCardEffect(CARD_ID)
    const player = createPlayer()
    const state = createState(player)

    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(0)
  })
})

describe('C132 Timber Shingle Maker parity', () => {
  const CARD_ID = 'C132_TimberShingleMaker'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, houseType = 'clay' as 'wood' | 'clay', rooms = 2, wood = 3,
  } = {}) => {
    const session = new GameSession(6132, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = houseType
    owner.rooms = rooms
    owner.roomTiles = Array.from({ length: rooms }, (_, row) => ({ row, col: 0 }))
    owner.resources.wood = wood
    owner.resources.reed = 1
    if (houseType === 'clay') owner.resources.stone = rooms
    else owner.resources.clay = rooms
    session.loadState(state)
    return session
  }

  const renovate = (session: GameSession) => {
    let response = session.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(response.interaction.playerIndex, 'stone')
    }
    return response
  }

  const paidWood = (option: ReturnType<typeof options>[number]) => {
    const params = option.labelParams?.resourcesPaid as { wood?: number } | undefined
    return params?.wood ?? option.effectPreview?.resourcesPaid?.wood
  }

  const enterTimberChoice = (session: GameSession, start: SessionResponse) => {
    let response = start
    for (let guard = 0; guard < 4 && response.interaction.stateId === 'wait'; guard += 1) {
      if (options(response).some((option) => paidWood(option) !== undefined)) break
      if (response.interaction.sourceCard !== CARD_ID) break
      const enter = options(response).find((option) => option.value !== '__skip__')
      if (!enter) break
      response = session.resolveChoice(response.interaction.playerIndex, enter.value)
    }
    return response
  }

  const chooseWood = (session: GameSession, start: SessionResponse, amount: number) => {
    const offered = enterTimberChoice(session, start)
    const choice = options(offered).find((option) => paidWood(option) === amount)
    expect(choice, JSON.stringify(offered.interaction)).toBeDefined()
    return session.resolveChoice(offered.interaction.playerIndex, choice!.value)
  }

  const bonusForCard = (response: SessionResponse) =>
    response.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
      .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

  it('C132 S2: renovating from wood to clay does not offer wood placement', () => {
    const response = renovate(setup({ houseType: 'wood' }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { wood: 3 },
    })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.woodPlaced ?? 0).toBe(0)
  })

  it('C132 S3: a two-room stone renovation can place two wood for two bonus points', () => {
    const session = setup()
    const response = chooseWood(session, renovate(session), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { wood: 1 },
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.woodPlaced).toBe(2)
    expect(bonusForCard(response)).toBe(2)
  })

  it('C132 S4: available wood limits the placement to one wood', () => {
    const session = setup({ rooms: 3, wood: 1 })
    const offered = enterTimberChoice(session, renovate(session))

    expect(options(offered).map(paidWood).filter((value) => value !== undefined)).toEqual([1])
    const response = chooseWood(session, offered, 1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.woodPlaced).toBe(1)
    expect(bonusForCard(response)).toBe(1)
  })

  it('C132 S5: the wood placement may be declined', () => {
    const session = setup()
    const offered = renovate(session)
    expect(offered.interaction.sourceCard).toBe(CARD_ID)
    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.woodPlaced ?? 0).toBe(0)
    expect(bonusForCard(response)).toBe(0)
  })
})
