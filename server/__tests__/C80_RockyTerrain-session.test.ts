import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C080_RockyTerrain'
import '../../shared/cards/B/B068_Beanfield'
import '../../shared/cards/B/B113_PatchCaregiver'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/C/C057_Crudite'
import '../../shared/cards/E/E054_Contraband'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C080_RockyTerrain'

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
    activeModifiers: [],
    extraOccupationsFromCards: [], playedCards: [], cardStates: {}, stats: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
    phase: 'playing', roundPhase: 'work', draft: null, enableCommunityDeck: false,
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

const expectPayGainStoneForFood = (result: { flow?: ActionFlow } | undefined) => {
  expect(result).toBeDefined()
  expect(result!.flow!.type).toBe('seq')
  const children = (result!.flow as Extract<ActionFlow, { children: ActionFlow[] }>).children
  const child0 = children[0] as Extract<ActionFlow, { type: 'leaf' }>
  const child1 = children[1] as Extract<ActionFlow, { type: 'leaf' }>
  expect(child0.actionId).toBe('pay')
  expect(child0.params).toEqual({ food: 1 })
  expect(child1.actionId).toBe('gain')
  expect(child1.params).toEqual({ stone: 1 })
}

const FILLER = '__test_placeholder__'
const FILLER_MINOR = 'C057_Crudite'

const setupParity = ({
  played = true, food = 2, minorHand = FILLER_MINOR, occupationHand = FILLER, occupations = 0,
}: {
  played?: boolean
  food?: number
  minorHand?: string
  occupationHand?: string
  occupations?: number
} = {}) => {
  const session = new GameSession(5080, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.minorHand = minorHand === FILLER_MINOR
    ? [FILLER_MINOR]
    : [minorHand, FILLER_MINOR]
  player.occupationHand = [occupationHand]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `__occupation_${index}__`)
  player.resources = {
    ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food, grain: 0, vegetable: 0,
  }
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let depth = 0; depth < 4; depth++) {
    if (response.interaction.stateId !== 'wait') return response
    const options = response.interaction.request.options ?? []
    const card = options.find((option) => option.value === cardId)
    if (card) return session.resolveChoice(response.interaction.playerIndex, card.value)
    const improvement = options.find((option) => option.value.startsWith('action-improvement-'))
    if (!improvement) return response
    response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

const resolveRockyTerrain = (session: GameSession, response: SessionResponse, accept: boolean) => {
  const stoneBefore = response.state.players[0]!.resources.stone
  for (let depth = 0; depth < 4; depth++) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'select-trigger') {
      const trigger = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
      expect(trigger).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
      continue
    }
    expect(response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(CARD_ID)
    const options = response.interaction.request.options ?? []
    const option = accept
      ? options.find((candidate) => candidate.value !== '__skip__')
      : options.find((candidate) => candidate.value === '__skip__')
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
    if (!accept || response.state.players[0]!.resources.stone > stoneBefore) return response
  }
  throw new Error('Rocky Terrain exchange did not resolve')
}

const plow = (session: GameSession) => {
  let response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'plow') {
    throw new Error('expected plow selection')
  }
  const tile = response.interaction.request.farm.selectableTiles[0]!
  response = session.commitSelectionChoice(0, { tile })
  return { response, tile }
}

const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

describe('C080 Rocky Terrain parity session', () => {
  it('C080 S1: paying one food plays Rocky Terrain', () => {
    const response = playMinor(setupParity({ played: false, food: 1, minorHand: CARD_ID }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C080 S2: after plowing a field one food can buy one stone', () => {
    const session = setupParity()
    const { response: offered, tile } = plow(session)

    const response = resolveRockyTerrain(session, offered, true)

    expect(response.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 1 })
  })

  it('C080 S3: declining after plowing keeps the food and gains no stone', () => {
    const session = setupParity()
    const { response: offered, tile } = plow(session)

    const response = resolveRockyTerrain(session, offered, false)

    expect(response.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 0 })
  })

  it('C080 S4: without food plowing grants no stone and offers no purchase', () => {
    const { response } = plow(setupParity({ food: 0 }))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 0 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('C080 S5: playing the Beanfield card can buy one stone for one food', () => {
    const session = setupParity({ food: 2, minorHand: 'B068_Beanfield', occupations: 2 })
    const offered = playMinor(session, 'B068_Beanfield')

    const response = resolveRockyTerrain(session, offered, true)

    expect(response.state.players[0]!.minorPlayed).toContain('B068_Beanfield')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 })
  })

  it('C080 S6: playing the Patch Caregiver field occupation can buy one stone for one food', () => {
    const session = setupParity({ food: 2, occupationHand: 'B113_PatchCaregiver' })
    let response = playOccupation(session, 'B113_PatchCaregiver')
    for (let depth = 0; depth < 3 && response.interaction.stateId === 'wait'
      && response.interaction.sourceCard === 'B113_PatchCaregiver'; depth++) {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    response = resolveRockyTerrain(session, response, true)

    expect(response.state.players[0]!.occupationPlayed).toContain('B113_PatchCaregiver')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 1 })
  })

  it('C080 S7: playing a non-field improvement does not offer a stone purchase', () => {
    const response = playMinor(
      setupParity({ food: 1, minorHand: 'E054_Contraband' }),
      'E054_Contraband',
    )

    expect(response.state.players[0]!.minorPlayed).toContain('E054_Contraband')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 0 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})

describe('C080_RockyTerrain', () => {
  describe('plow trigger', () => {
    it('returns pay-gain flow after plow when player has food', () => {
      const listener = findListener('C80-rocky-terrain-after-plow')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 3
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('plow'),
        actionId: 'plow', phase: 'after',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('does not trigger plow flow when player has no food', () => {
      const listener = findListener('C80-rocky-terrain-after-plow')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 0
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('plow'),
        actionId: 'plow', phase: 'after',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })
  })

  describe('improvement field-card trigger (reference onPlayerAfterImprovement)', () => {
    it('triggers when a minor field card (B68 Beanfield) is built', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 2
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('improvement'),
        actionId: 'improvement', phase: 'after',
        choice: 'minor:B068_Beanfield',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('triggers when E70 CropRotationField is built', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 1
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('improvement'),
        actionId: 'improvement', phase: 'after',
        choice: 'minor:E070_CropRotationField',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('does not trigger when a non-field minor improvement is built', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 5
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('improvement'),
        actionId: 'improvement', phase: 'after',
        choice: 'minor:E054_Contraband',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger when player has no food (even on field card)', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 0
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('improvement'),
        actionId: 'improvement', phase: 'after',
        choice: 'minor:B068_Beanfield',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('triggers on D75 Wood Field stub (isField=true even though impl deferred)', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 1
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('improvement'),
        actionId: 'improvement', phase: 'after',
        choice: 'minor:D075_WoodField',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })
  })

  describe('occupation field-card trigger (reference onPlayerAfterOccupation)', () => {
    it('triggers when a field occupation (B113 PatchCaregiver) is played', () => {
      const listener = findListener('C80-rocky-terrain-after-occupation-field')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 2
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('lessons'),
        actionId: 'occupation', phase: 'after',
        choice: 'B113_PatchCaregiver',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('does not trigger when a non-field occupation is played', () => {
      const listener = findListener('C80-rocky-terrain-after-occupation-field')
      const player = createPlayer()
      player.resources.food = 5
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('lessons'),
        actionId: 'occupation', phase: 'after',
        choice: 'E051_WhaleOil',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger when player has no food (even on field occupation)', () => {
      const listener = findListener('C80-rocky-terrain-after-occupation-field')
      const player = createPlayer()
      player.resources.food = 0
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('lessons'),
        actionId: 'occupation', phase: 'after',
        choice: 'B113_PatchCaregiver',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })
  })
})
